import type { TMemoryMapping } from "@k13engineering/po6-mmap";
import { type TMemoryProtectionFlags } from "@k13engineering/po6-mmap/dist/lib/convenience-api.js";
import { createDefaultGarbageCollectedWithoutReleaseError, createGarbageCollectionGuard } from "./snippets/gc-guard.ts";
import { createCachedMapper } from "./cached-mapper.ts";

type TDmabufMappingPolicy = "forbidden" | "required" | "optional";

type TDmabufMappingAccess = {
  read: TDmabufMappingPolicy;
  write: TDmabufMappingPolicy;
};

type TDmabufMapping = {
  mappingId: number;

  address: bigint;
  length: number;

  createArrayBuffer: TMemoryMapping["createArrayBuffer"];
  release: () => void;
};

type TDmabufMappingInfo = {
  mappingId: number;
};

const createMappingHelper = ({
  mapAsserted
}: {
  mapAsserted: (args: { memoryProtectionFlags: TMemoryProtectionFlags }) => TMemoryMapping;
}) => {

  const readOnlyCachedMapper = createCachedMapper({
    map: () => {
      return mapAsserted({
        memoryProtectionFlags: {
          PROT_READ: true,
          PROT_WRITE: false,
          PROT_EXEC: false
        },
      });
    },
  });

  const writeOnlyCachedMapper = createCachedMapper({
    map: () => {
      return mapAsserted({
        memoryProtectionFlags: {
          PROT_READ: false,
          PROT_WRITE: true,
          PROT_EXEC: false
        },
      });
    },
  });

  const readWriteCachedMapper = createCachedMapper({
    map: () => {
      return mapAsserted({
        memoryProtectionFlags: {
          PROT_READ: true,
          PROT_WRITE: true,
          PROT_EXEC: false
        },
      });
    },
  });

  const dmabufMappingGarbageCollectionGuard = createGarbageCollectionGuard({
    createError: ({ info }: { info: TDmabufMappingInfo }) => {
      return createDefaultGarbageCollectedWithoutReleaseError({
        info: `dma buffer mapping with mappingId=${info.mappingId}`,
        name: "DmabufMappingGarbageCollectedWithoutReleaseError",
        releaseFunctionName: "release",
        resourcesName: "dma buffer mappings",
      });
    },
  });

  let mappingIdCounter = 0;

  // eslint-disable-next-line complexity
  const map = ({ access }: { access: TDmabufMappingAccess }): TDmabufMapping => {

    const mappingId = mappingIdCounter;
    mappingIdCounter += 1;
    // naive approach for now

    let mapperToUse: typeof readOnlyCachedMapper;

    if (access.read === "forbidden" && access.write === "forbidden") {
      throw Error(`invalid mapping access: read and write cannot both be forbidden`);
    }

    if (access.read === "required" && access.write === "required") {
      mapperToUse = readWriteCachedMapper;
    } else if (access.write === "required" || access.read === "forbidden") {
      mapperToUse = writeOnlyCachedMapper;
    } else {
      mapperToUse = readOnlyCachedMapper;
    }

    const mappedBuffer = mapperToUse.maybeMap();

    const mappingInfo: TDmabufMappingInfo = {
      mappingId
    };

    const { release } = dmabufMappingGarbageCollectionGuard.protect({
      release: () => {
        mappedBuffer.release();
      },

      info: mappingInfo
    });

    return {
      mappingId,
      address: mappedBuffer.address,
      length: mappedBuffer.length,
      createArrayBuffer: mappedBuffer.createArrayBuffer,
      release,
    };
  };

  const close = () => {
    readOnlyCachedMapper.close();
    writeOnlyCachedMapper.close();
    readWriteCachedMapper.close();
  };

  return {
    map,
    close
  };
};

export {
  createMappingHelper,
};

export type {
  TDmabufMapping,
  TDmabufMappingAccess,
  TDmabufMappingPolicy
};
