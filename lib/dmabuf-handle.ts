
import nodeFs from "node:fs";
import { assertIsADmaBuf } from "./fd-checks.ts";
import { dup } from "./dup.ts";
import { dmabufIoctlSyncEnd, dmabufIoctlSyncStart } from "./dmabuf-ioctl.ts";

type TDmabufInfo = {
  inode: number;
  size: number;
};

type TMapAccess = {
  read: boolean;
  write: boolean;
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

type TDmabufHandle = {
  exportAndDupAsDmabufFd: () => { dmabufFd: number };
  info: () => TDmabufInfo;
  map: (args: { iKnowWhatImDoing: boolean, access: TMapAccess }) => Uint8Array;
  sync: (args: { iKnowWhatImDoing: boolean } & TSyncReadOrWrite) => TDmabufSync;
  close: () => void;
};

const importAndDupDmabuf = ({ dmabufFd: providedDmabufFd }: { dmabufFd: number }): TDmabufHandle => {

  assertIsADmaBuf({ dmabufFd: providedDmabufFd });
  const dmabufFd = dup({ fd: providedDmabufFd });

  let closed = false;

  const st = nodeFs.fstatSync(dmabufFd);
  const inode = st.ino;

  const assertNotClosed = () => {
    if (closed) {
      throw Error(`dmabuf handle already closed`);
    }
  };

  const assertFdIsUnchanged = () => {
    try {
      assertIsADmaBuf({ dmabufFd });
    } catch (e) {
      let message = `internal dmabuf handle ${dmabufFd} (inode ${inode}) is no longer a valid dmabuf fd,`;
      message += ` probably someone closed a wrong file descriptor`;
      message += ` - your program is probably in an inconsistent state`;
      throw Error(message, { cause: e as Error });
    }

    const currentSt = nodeFs.fstatSync(dmabufFd);
    if (currentSt.ino !== inode) {
      let message = `internal dmabuf handle ${dmabufFd} (inode ${inode}) fd's inode has changed to ${currentSt.ino},`;
      message += ` probably someone closed a wrong file descriptor and the OS reused the fd for a different file`;
      message += ` - your program is probably in an inconsistent state`;
      throw Error(message);
    }
  };

  const exportAndDupAsDmabufFd: TDmabufHandle["exportAndDupAsDmabufFd"] = () => {
    assertNotClosed();
    assertFdIsUnchanged();

    const newFd = dup({ fd: dmabufFd });

    return {
      dmabufFd: newFd
    };
  };

  const info: TDmabufHandle["info"] = () => {
    assertNotClosed();
    assertFdIsUnchanged();

    const stat = nodeFs.fstatSync(dmabufFd);

    const dmabufInfo: TDmabufInfo = {
      inode: stat.ino,
      size: stat.size
    };

    return dmabufInfo;
  };

  // type TMapping = {
  //   buffer: TMemoryMappedBuffer;
  //   access: TMapAccess;
  // };

  const map: TDmabufHandle["map"] = ({ iKnowWhatImDoing }) => {
    if (!iKnowWhatImDoing) {
      let message = `mapping dmabufs is for internal or advanced usage only:`;
      message += ` dmabuf accesses need proper synchronization;`;
      message += ` accessing the mapped memory after close can cause program crashes or data corruption`;
      message += ` if you really want to do this, please set iKnowWhatImDoing to true`;

      throw Error(message);
    }

    assertNotClosed();
    assertFdIsUnchanged();

    throw Error("dmabuf mapping not yet implemented");
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

    dmabufIoctlSyncStart({ dmabufFd, read, write });
    syncStarted = true;

    let stale = false;

    const end = () => {
      assertNotClosed();
      assertFdIsUnchanged();

      if (stale) {
        throw Error(`stale sync instance, end() already called`);
      }

      dmabufIoctlSyncEnd({ dmabufFd, read: true, write: true });
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

    nodeFs.closeSync(dmabufFd);
    closed = true;
  };

  return {
    exportAndDupAsDmabufFd,
    info,
    map,
    sync,
    close
  };
};

export type {
  TDmabufHandle,
  TMapAccess,
  TSyncReadOrWrite,
  TDmabufSync
};

export {
  importAndDupDmabuf
};
