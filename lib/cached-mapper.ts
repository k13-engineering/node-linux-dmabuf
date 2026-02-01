import type { TMemoryMapping } from "@k13engineering/po6-mmap";

type TRefcountedBufferMapping = {
  address: bigint;
  length: number;
  createArrayBuffer: () => ArrayBuffer;
  release: () => void;
};

const createCachedMapper = ({
  map,
}: {
  map: () => TMemoryMapping;
}) => {

  let refcount = 0;
  let backingBufferMapping: TMemoryMapping | undefined = undefined;

  const maybeMap = (): TRefcountedBufferMapping => {
    if (backingBufferMapping === undefined) {
      backingBufferMapping = map();
    }

    refcount += 1;
    let released = false;

    // eslint-disable-next-line complexity
    const release = () => {
      if (released) {
        throw Error("handle already released");
      }

      if (refcount <= 0) {
        throw Error("BUG: release called when refcount is <= 0");
      }

      if (backingBufferMapping === undefined) {
        throw Error("BUG: release called but mappedBuffer is undefined");
      }

      refcount -= 1;

      if (refcount === 0) {
        backingBufferMapping.unmap();
        backingBufferMapping = undefined;
      }

      released = true;
    };

    return {
      address: backingBufferMapping.address,
      length: backingBufferMapping.length,
      createArrayBuffer: backingBufferMapping.createArrayBuffer,
      release,
    };
  };

  const mapped = () => {
    return backingBufferMapping !== undefined;
  };

  const close = () => {

  };

  return {
    maybeMap,
    mapped,
    close
  };
};

export {
  createCachedMapper
};
