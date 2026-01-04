
import { type TMemoryProtectionFlags } from "@k13engineering/po6-mmap";
import { createMappingHelper, type TDmabufMapping, type TDmabufMappingAccess } from "./dmabuf-mapping.ts";
import { createDefaultGarbageCollectedWithoutReleaseError, createGarbageCollectionGuard } from "./snippets/gc-guard.ts";
import type { TLinuxDmabufInterface } from "./linux-interface.ts";

type TDmabufInfo = {
  inode: number;
  size: number;
};

type TDmabufSync = {
  end: () => void;
};

type TSyncReadOrWrite = {
  read: true;
  write: false;
} | {
  read: false;
  write: true;
} | {
  read: true;
  write: true;
};

type TDmabufHandleInfo = {
  handleId: number;
  inode: number;
  size: number;
};

type TDmabufHandle = {
  exportAndDupAsDmabufFd: () => { dmabufFd: number };
  info: () => TDmabufInfo;
  map: (args: { iKnowWhatImDoing: boolean, access: TDmabufMappingAccess }) => TDmabufMapping;
  sync: (args: { iKnowWhatImDoing: boolean } & TSyncReadOrWrite) => TDmabufSync;
  close: () => void;
};

const dmabufGarbageCollectionGuard = createGarbageCollectionGuard({
  createError: ({ info }: { info: TDmabufHandleInfo }) => {
    return createDefaultGarbageCollectedWithoutReleaseError({
      name: "DmabufMappingGarbageCollectedWithoutReleaseError",
      info: `dma buffer handle with handleId=${info.handleId} inode=${info.inode} size=${info.size}`,
      releaseFunctionName: "release",
      resourcesName: "dma buffer handles",
    });
  }
});

let handleIdCounter = 0;


const createHandleImporter = ({
  linuxInterface
}: {
  linuxInterface: TLinuxDmabufInterface
}) => {


  // eslint-disable-next-line max-statements
  const importAndDupDmabuf = ({ dmabufFd: providedDmabufFd }: { dmabufFd: number }): TDmabufHandle => {

    const assertIsADmaBuf = ({ dmabufFd }: { dmabufFd: number }): void => {
      if (dmabufFd < 0) {
        throw Error(`invalid dmabuf fd ${dmabufFd}`);
      }

      try {
        linuxInterface.fstat({ fd: dmabufFd });
      } catch (ex) {
        throw Error(`invalid dmabuf fd ${dmabufFd}, fstat failed`, { cause: ex as Error });
      }

      try {
        linuxInterface.dmabufIoctlSyncStart({ dmabufFd, read: true, write: false });
        linuxInterface.dmabufIoctlSyncEnd({ dmabufFd, read: true, write: false });
      } catch (ex) {
        throw Error(`fd ${dmabufFd} is not a valid dmabuf fd, ioctl check failed`, { cause: ex as Error });
      }
    };

    assertIsADmaBuf({ dmabufFd: providedDmabufFd });
    const dmabufFd = linuxInterface.dup({ fd: providedDmabufFd });

    let closed = false;

    const st = linuxInterface.fstat({ fd: dmabufFd });
    const inode = st.inode;

    const assertNotClosed = () => {
      if (closed) {
        throw Error(`dmabuf handle already closed`);
      }
    };

    const assertFdIsUnchanged = () => {
      // try {
      //   assertIsADmaBuf({ dmabufFd });
      // } catch (e) {
      //   let message = `internal dmabuf handle ${dmabufFd} (inode ${inode}) is no longer a valid dmabuf fd,`;
      //   message += ` probably someone closed a wrong file descriptor`;
      //   message += ` - your program is probably in an inconsistent state`;
      //   throw Error(message, { cause: e as Error });
      // }

      const currentSt = linuxInterface.fstat({ fd: dmabufFd });
      if (currentSt.inode !== inode) {
        let message = `internal dmabuf handle ${dmabufFd} (inode ${inode}) fd's inode has changed to ${currentSt.inode},`;
        message += ` probably someone closed a wrong file descriptor and the OS reused the fd for a different file`;
        message += ` - your program is probably in an inconsistent state`;
        throw Error(message);
      }
    };

    const exportAndDupAsDmabufFd: TDmabufHandle["exportAndDupAsDmabufFd"] = () => {
      assertNotClosed();
      assertFdIsUnchanged();

      const newFd = linuxInterface.dup({ fd: dmabufFd });

      return {
        dmabufFd: newFd
      };
    };

    const info: TDmabufHandle["info"] = () => {
      assertNotClosed();
      assertFdIsUnchanged();

      const stat = linuxInterface.fstat({ fd: dmabufFd });

      const dmabufInfo: TDmabufInfo = {
        inode: stat.inode,
        size: stat.size
      };

      return dmabufInfo;
    };

    // type TMapping = {
    //   buffer: TMemoryMappedBuffer;
    //   access: TMapAccess;
    // };

    const mapAsserted = ({ memoryProtectionFlags }: { memoryProtectionFlags: TMemoryProtectionFlags }) => {
      const { size } = info();

      const { errno, buffer } = linuxInterface.mmapFd({
        fd: dmabufFd,
        mappingVisibility: "MAP_SHARED",
        memoryProtectionFlags,
        genericFlags: {},
        offsetInFd: 0,
        length: size
      });

      if (errno !== undefined) {
        throw Error(`dmabuf mmap failed with errno ${errno}`);
      }

      return buffer;
    };

    const mappingHelper = createMappingHelper({
      mapAsserted
    });

    const map: TDmabufHandle["map"] = ({ iKnowWhatImDoing, access }) => {
      if (!iKnowWhatImDoing) {
        let message = `mapping dmabufs is for internal or advanced usage only:`;
        message += ` dmabuf accesses need proper synchronization;`;
        message += ` accessing the mapped memory after close can cause program crashes or data corruption`;
        message += ` if you really want to do this, please set iKnowWhatImDoing to true`;

        throw Error(message);
      }

      assertNotClosed();
      assertFdIsUnchanged();

      const mapping = mappingHelper.map({ access });

      return mapping;
    };

    let syncStarted = false;

    const sync: TDmabufHandle["sync"] = ({ iKnowWhatImDoing, read, write }) => {
      if (!iKnowWhatImDoing) {
        let message = `creating dmabuf sync is for internal or advanced usage only:`;
        message += ` start / end calls must be properly paired;`;
        message += ` if you really want to do this, please set iKnowWhatImDoing to true`;

        throw Error(message);
      }

      assertNotClosed();
      assertFdIsUnchanged();

      if (syncStarted) {
        throw Error(`dmabuf sync already started, make sure to call end() before starting a new sync`);
      }

      linuxInterface.dmabufIoctlSyncStart({ dmabufFd, read, write });
      syncStarted = true;

      let stale = false;

      const end = () => {
        assertNotClosed();
        assertFdIsUnchanged();

        if (stale) {
          throw Error(`stale sync instance, end() already called`);
        }

        linuxInterface.dmabufIoctlSyncEnd({ dmabufFd, read: true, write: true });
        syncStarted = false;
        stale = true;
      };

      return {
        end
      };
    };

    const close: TDmabufHandle["close"] = () => {
      assertNotClosed();
      assertFdIsUnchanged();

      if (syncStarted) {
        throw Error(`dmabuf sync started but not ended, please end sync before closing the handle`);
      }

      linuxInterface.close({ fd: dmabufFd });
      closed = true;
    };

    const handleId = handleIdCounter;
    handleIdCounter += 1;

    const { release: protectedClose } = dmabufGarbageCollectionGuard.protect({
      release: () => {
        close();
      },

      info: {
        handleId,
        inode,
        size: info().size
      }
    });

    return {
      exportAndDupAsDmabufFd,
      info,
      map,
      sync,
      close: protectedClose
    };
  };

  return {
    importAndDupDmabuf
  };
};

type THandleImporter = ReturnType<typeof createHandleImporter>;
type TImportAndDupDmabufFunc = THandleImporter["importAndDupDmabuf"];

export {
  createHandleImporter
};

export type {
  TDmabufHandle,
  TSyncReadOrWrite,
  TDmabufSync,
  TImportAndDupDmabufFunc
};
