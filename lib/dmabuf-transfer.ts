import type { TDmabufMapping } from "./dmabuf-handle-mapping.ts";
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
  mapping: TDmabufMapping;
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

  const readInternal = ({
    internalHandle,
    offset,
    length
  }: {
    internalHandle: TUseInternal<TBufferUseReadHandle>,
    offset: number,
    length: number
  }) => {
    const mapping = internalHandle.mapping;

    const slice = mapping.subarray(offset, offset + length);

    const result = new Uint8Array(length);
    result.set(slice, 0);

    return result;
  };

  const writeInternal = ({
    internalHandle,
    offset,
    data
  }: {
    internalHandle: TUseInternal<TBufferUseWriteHandle>,
    offset: number,
    data: Uint8Array
  }) => {
    const mapping = internalHandle.mapping;

    const slice = mapping.subarray(offset, offset + data.length);
    slice.set(data, 0);
  };

  const useReadOnly: TTransactionFunctionArgs["useReadOnly"] = ({ handle }) => {
    assertHandleNotAlreadyUsed({ handle });

    const read: TBufferUseReadHandle["read"] = ({ offset, length }) => {
      return readInternal({
        // eslint-disable-next-line no-use-before-define
        internalHandle,
        offset,
        length
      });
    };

    const useHandle: TBufferUseReadHandle = {
      read
    };

    const sync = handle.sync({ iKnowWhatImDoing: true, read: true, write: false });
    const mapping = handle.map({
      iKnowWhatImDoing: true,
      access: {
        read: "required",
        write: "optional"
      }
    });

    const internalHandle: TUseInternal<TBufferUseReadHandle> = {
      use: useHandle,
      handle,
      sync,
      mapping
    };

    readOnlyUses = [
      ...readOnlyUses,
      internalHandle
    ];

    return useHandle;
  };

  const useWriteOnly: TTransactionFunctionArgs["useWriteOnly"] = ({ handle }) => {
    assertHandleNotAlreadyUsed({ handle });

    const write: TBufferUseWriteHandle["write"] = ({ offset, data }) => {
      return writeInternal({
        // eslint-disable-next-line no-use-before-define
        internalHandle,
        offset,
        data
      });
    };

    const useHandle: TBufferUseWriteHandle = {
      write
    };

    const sync = handle.sync({ iKnowWhatImDoing: true, read: false, write: true });
    const mapping = handle.map({
      iKnowWhatImDoing: true,
      access: {
        read: "optional",
        write: "required"
      }
    });

    const internalHandle: TUseInternal<TBufferUseWriteHandle> = {
      use: useHandle,
      handle,
      sync,
      mapping
    };

    writeOnlyUses = [
      ...writeOnlyUses,
      internalHandle
    ];

    return useHandle;
  };

  const useReadWrite: TTransactionFunctionArgs["useReadWrite"] = ({ handle }) => {
    assertHandleNotAlreadyUsed({ handle });

    const read: TBufferUseReadWriteHandle["read"] = ({ offset, length }) => {
      return readInternal({
        // eslint-disable-next-line no-use-before-define
        internalHandle,
        offset,
        length
      });
    };
    const write: TBufferUseReadWriteHandle["write"] = ({ offset, data }) => {
      return writeInternal({
        // eslint-disable-next-line no-use-before-define
        internalHandle,
        offset,
        data
      });
    };

    const useHandle: TBufferUseReadWriteHandle = {
      read,
      write
    };

    const sync = handle.sync({ iKnowWhatImDoing: true, read: true, write: true });
    const mapping = handle.map({
      iKnowWhatImDoing: true,
      access: {
        read: "required",
        write: "required"
      }
    });

    const internalHandle: TUseInternal<TBufferUseReadWriteHandle> = {
      use: useHandle,
      handle,
      sync,
      mapping
    };

    readWriteUses = [
      ...readWriteUses,
      internalHandle
    ];

    return useHandle;
  };

  const internalHandleFromReadUse = ({ readUse }: { readUse: TBufferUseReadHandle }): TUseInternal<TBufferUseReadHandle> => {
    const internalUse = [...readOnlyUses, ...readWriteUses].find((elem) => {
      return elem.use === readUse;
    });

    if (internalUse === undefined) {
      throw Error(`internal error: could not find internal use for provided read use`);
    }

    return internalUse;
  };

  const internalHandleFromWriteUse = ({ writeUse }: { writeUse: TBufferUseWriteHandle }): TUseInternal<TBufferUseWriteHandle> => {
    const internalUse = [...writeOnlyUses, ...readWriteUses].find((elem) => {
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
  ].forEach(({ sync, mapping }) => {
    sync.end();
    mapping.release();
  });

  return result;
};

export {
  transaction
};
