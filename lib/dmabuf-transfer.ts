import type { TDmabufHandle, TDmabufSync } from "./dmabuf-handle.ts";

type TBufferUseReadHandle = {
  read: (args: { offset: number, length: number }) => Uint8Array;
};

type TBufferUseWriteHandle = {
  write: (args: { offset: number, data: Uint8Array }) => void;
};

type TBufferUseReadWriteHandle = TBufferUseReadHandle & TBufferUseWriteHandle;

type TBufferUseWithOffset<T> = {
  handle: T;
  offset: number;
};

type TTransactionFunctionArgs = {
  useReadOnly: (args: { handle: TDmabufHandle }) => TBufferUseReadHandle;
  useWriteOnly: (args: { handle: TDmabufHandle }) => TBufferUseWriteHandle;
  useReadWrite: (args: { handle: TDmabufHandle }) => TBufferUseReadWriteHandle;

  copy: (args: {
    source: TBufferUseWithOffset<TBufferUseReadHandle>,
    destination: TBufferUseWithOffset<TBufferUseWriteHandle>,
    length: number
  }) => void;
};

type TTransactionFunction<T> = (args: TTransactionFunctionArgs) => T;

type TUseInternal<T> = {
  use: T;
  handle: TDmabufHandle;
  sync: TDmabufSync;
  mapping: Uint8Array;
};

// eslint-disable-next-line max-statements
const transaction = <T>(fn: TTransactionFunction<T>) => {

  let readOnlyUses: TUseInternal<TBufferUseReadHandle>[] = [];
  let writeOnlyUses: TUseInternal<TBufferUseWriteHandle>[] = [];
  let readWriteUses: TUseInternal<TBufferUseReadWriteHandle>[] = [];

  const assertHandleNotAlreadyUsed = ({ handle }: { handle: TDmabufHandle }) => {
    const existingUses = [
      ...readOnlyUses,
      ...writeOnlyUses,
      ...readWriteUses
    ].filter((internalUse) => {
      return internalUse.handle === handle;
    });

    if (existingUses.length > 0) {
      throw Error(`dmabuf handle (inode ${handle.info().inode}) is already used in this transaction`);
    }
  };

  const createRead = ({ handle }: { handle: TDmabufHandle }): TBufferUseReadHandle["read"] => {
    return ({ offset, length }) => {
      const mappedBuffer = handle.map({ iKnowWhatImDoing: true, access: { read: true, write: false } });
      const slice = mappedBuffer.subarray(offset, offset + length);

      const result = new Uint8Array(length);
      result.set(slice, 0);

      return result;
    };
  };

  const createWrite = ({ handle }: { handle: TDmabufHandle }): TBufferUseWriteHandle["write"] => {
    return ({ offset, data }) => {
      const mappedBuffer = handle.map({ iKnowWhatImDoing: true, access: { read: false, write: true } });
      const slice = mappedBuffer.subarray(offset, offset + data.length);
      slice.set(data, 0);
    };
  };

  const useReadOnly: TTransactionFunctionArgs["useReadOnly"] = ({ handle }) => {
    assertHandleNotAlreadyUsed({ handle });

    const read = createRead({ handle });

    const useHandle: TBufferUseReadHandle = {
      read
    };

    const sync = handle.sync({ iKnowWhatImDoing: true, read: true, write: false });
    const mapping = handle.map({ iKnowWhatImDoing: true, access: { read: true, write: false } });

    readOnlyUses = [
      ...readOnlyUses,
      {
        use: useHandle,
        handle,
        sync,
        mapping
      }
    ];

    return useHandle;
  };

  const useWriteOnly: TTransactionFunctionArgs["useWriteOnly"] = ({ handle }) => {
    assertHandleNotAlreadyUsed({ handle });

    const write = createWrite({ handle });

    const useHandle: TBufferUseWriteHandle = {
      write
    };

    const sync = handle.sync({ iKnowWhatImDoing: true, read: false, write: true });
    const mapping = handle.map({ iKnowWhatImDoing: true, access: { read: false, write: true } });

    writeOnlyUses = [
      ...writeOnlyUses,
      {
        use: useHandle,
        handle,
        sync,
        mapping
      }
    ];

    return useHandle;
  };

  const useReadWrite: TTransactionFunctionArgs["useReadWrite"] = ({ handle }) => {
    assertHandleNotAlreadyUsed({ handle });

    const read = createRead({ handle });
    const write = createWrite({ handle });

    const useHandle: TBufferUseReadWriteHandle = {
      read,
      write
    };

    const sync = handle.sync({ iKnowWhatImDoing: true, read: true, write: true });
    const mapping = handle.map({ iKnowWhatImDoing: true, access: { read: true, write: true } });

    readWriteUses = [
      ...readWriteUses,
      {
        use: useHandle,
        handle,
        sync,
        mapping
      }
    ];

    return useHandle;
  };

  const internalHandleFromReadUse = ({ readUse }: { readUse: TBufferUseReadHandle }): TUseInternal<TBufferUseReadHandle> => {
    const internalUse = [ ...readOnlyUses, ...readWriteUses ].find((elem) => {
      return elem.use === readUse;
    });

    if (internalUse === undefined) {
      throw Error(`internal error: could not find internal use for provided read use`);
    }

    return internalUse;
  };

  const internalHandleFromWriteUse = ({ writeUse }: { writeUse: TBufferUseWriteHandle }): TUseInternal<TBufferUseWriteHandle> => {
    const internalUse = [ ...writeOnlyUses, ...readWriteUses ].find((elem) => {
      return elem.use === writeUse;
    });

    if (internalUse === undefined) {
      throw Error(`internal error: could not find internal use for provided write use`);
    }

    return internalUse;
  };

  const copy: TTransactionFunctionArgs["copy"] = ({ source, destination, length }) => {
    const { mapping: sourceMapping } = internalHandleFromReadUse({ readUse: source.handle });
    const { mapping: destinationMapping } = internalHandleFromWriteUse({ writeUse: destination.handle });

    const sourceSlice = sourceMapping.subarray(source.offset, source.offset + length);
    const destinationSlice = destinationMapping.subarray(destination.offset, destination.offset + length);

    destinationSlice.set(sourceSlice, 0);
  };

  const result = fn({
    useReadOnly,
    useWriteOnly,
    useReadWrite,
    copy,
  });

  [
    ...readOnlyUses,
    ...writeOnlyUses,
    ...readWriteUses
  ].forEach(({ sync }) => {
    sync.end();
  });

  return result;
};

export {
  transaction
};
