import type { TMemoryMappedBuffer } from "@k13engineering/po6-mmap";

type TRefcountedBufferMapping = Uint8Array & {
  release: () => void;
};

const createCachedMapper = ({
  map,
}: {
  map: () => TMemoryMappedBuffer;
}) => {

  let refcount = 0;
  let mappedBuffer: TMemoryMappedBuffer | undefined = undefined;

  const maybeMap = (): TRefcountedBufferMapping => {
    if (mappedBuffer === undefined) {
      mappedBuffer = map();
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

      if (mappedBuffer === undefined) {
        throw Error("BUG: release called but mappedBuffer is undefined");
      }

      refcount -= 1;

      if (refcount === 0) {
        mappedBuffer.unmap();
        mappedBuffer = undefined;
      }

      released = true;
    };

    const bufferView = new Uint8Array(mappedBuffer.buffer, mappedBuffer.byteOffset, mappedBuffer.byteLength);
    const cachedMappedBuffer = bufferView as TRefcountedBufferMapping;

    // monkey-patch mappingId and release method
    cachedMappedBuffer.release = release;

    return cachedMappedBuffer;
  };

  const mapped = () => {
    return mappedBuffer !== undefined;
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
