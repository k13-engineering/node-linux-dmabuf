import type { TDmabufHandle, TDmabufSync, TSyncReadOrWrite } from "./dmabuf-handle.ts";

type THandleWithOffset = {
  handle: TDmabufHandle;
  offset: number;
};

type THandleAccessHint = {
  handle: TDmabufHandle;
  access: TSyncReadOrWrite;
};

type TTransactionFunctionArgs = {
  readFrom: (args: { handle: TDmabufHandle, offset: number, length: number }) => Uint8Array;
  writeTo: (args: { handle: TDmabufHandle, offset: number, data: Uint8Array }) => void;
  copy: (args: { source: THandleWithOffset, destination: THandleWithOffset, length: number }) => void;
  hints: (args: { operations: THandleAccessHint[] }) => void;
};

type TTransactionFunction<T> = (args: TTransactionFunctionArgs) => T;

const transaction = <T>(fn: TTransactionFunction<T>) => {

  type THandleWithSync = {
    handle: TDmabufHandle;
    sync: TDmabufSync;
  }

  let activeSyncs: THandleWithSync[] = [];

  const requestAccess = ({ handle, access }: { handle: TDmabufHandle, access: TSyncReadOrWrite }) => {
    // TODO: implement proper synchronization of dmabuf accesses


    const sync = handle.sync({ iKnowWhatImDoing: true, ...access });

    activeSyncs = [
      ...activeSyncs,
      {
        handle,
        sync
      }
    ];
  };

  const readFrom: TTransactionFunctionArgs["readFrom"] = ({ handle, offset, length }) => {
    requestAccess({ handle, access: { read: true, write: false } });

    const mappedBuffer = handle.map({ iKnowWhatImDoing: true, access: { read: true, write: false } });
    const slice = mappedBuffer.subarray(offset, offset + length);

    const result = new Uint8Array(length);
    result.set(slice, 0);

    return result;
  };

  const writeTo: TTransactionFunctionArgs["writeTo"] = ({ handle, offset, data }) => {
    requestAccess({ handle, access: { read: false, write: true } });

    const mappedBuffer = handle.map({ iKnowWhatImDoing: true, access: { read: false, write: true } });
    const slice = mappedBuffer.subarray(offset, offset + data.length);
    slice.set(data, 0);
  };

  const copy: TTransactionFunctionArgs["copy"] = ({ source, destination, length }) => {
    requestAccess({ handle: source.handle, access: { read: true, write: false } });
    requestAccess({ handle: destination.handle, access: { read: false, write: true } });

    const sourceMappedBuffer = source.handle.map({ iKnowWhatImDoing: true, access: { read: true, write: false } });
    const sourceSlice = sourceMappedBuffer.subarray(source.offset, source.offset + length);

    const destinationMappedBuffer = destination.handle.map({ iKnowWhatImDoing: true, access: { read: false, write: true } });
    const destinationSlice = destinationMappedBuffer.subarray(destination.offset, destination.offset + length);

    destinationSlice.set(sourceSlice, 0);
  };

  const hints: TTransactionFunctionArgs["hints"] = ({ operations }) => {
    operations.forEach(({ handle, access }) => {
      requestAccess({ handle, access });
    });
  };

  const result = fn({
    readFrom,
    writeTo,
    copy,
    hints
  });

  activeSyncs.forEach(({ sync }) => {
    sync.end();
  });

  return result;
};

export {
  transaction
};
