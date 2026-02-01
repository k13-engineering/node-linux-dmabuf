import type { TDmabufMapping } from "./dmabuf-mapping.ts";
import type { TDmabufHandle, TDmabufSync } from "./dmabuf-handle.ts";

type TTransactionFunctionArgs = {
  use: (args: {
    handle: TDmabufHandle;
    access: TDmabufUseAccess
  }) => Uint8Array;
};

type TTransactionFunction<T> = (args: TTransactionFunctionArgs) => T;

type TDmabufUseAccess = {
  read: "required",
  write: "required"
} | {
  read: "required",
  write: "crash-process-on-write"
} | {
  read: "crash-process-on-read",
  write: "required"
};

// type TDmabufReadUseAccess = TDmabufUseAccess["read"];
// type TDmabufWriteUseAccess = TDmabufUseAccess["write"];

type TUseInternal = {
  handle: TDmabufHandle;
  sync: TDmabufSync;
  mapping: TDmabufMapping;
};

let transactionEntered = false;

const dmabufTransaction = <T>(fn: TTransactionFunction<T>) => {

  if (transactionEntered) {
    throw Error("nested transactions are not allowed");
  }

  let internalUses: TUseInternal[] = [];

  const assertHandleNotAlreadyUsed = ({ handle }: { handle: TDmabufHandle }) => {
    const existingUses = internalUses.filter((internalUse) => {
      return internalUse.handle === handle;
    });

    if (existingUses.length > 0) {
      throw Error(`dmabuf handle (inode ${handle.info().inode}) is already used in this transaction`);
    }
  };

  const use = ({
    handle,
    access,
  }: {
    handle: TDmabufHandle;
    access: TDmabufUseAccess
  }) => {
    assertHandleNotAlreadyUsed({ handle });

    const mapping = handle.map({
      iKnowWhatImDoing: true,
      access: {
        read: access.read === "required" ? "required" : "forbidden",
        write: access.write === "required" ? "required" : "forbidden"
      }
    });

    // @ts-expect-error 2345 - TypeScript does not get this right
    const sync = handle.sync({
      iKnowWhatImDoing: true,
      read: access.read === "required",
      write: access.write === "required"
    });

    const internalHandle: TUseInternal = {
      handle,
      sync,
      mapping
    };

    internalUses = [
      ...internalUses,
      internalHandle
    ];

    const backingArrayBuffer = mapping.createArrayBuffer();

    const buffer = new Uint8Array(backingArrayBuffer, 0, backingArrayBuffer.byteLength);
    return buffer;
  };

  transactionEntered = true;

  let result: T;

  try {
    result = fn({
      use
    });
  } finally {
    transactionEntered = false;
  }

  internalUses.forEach(({ sync, mapping }) => {
    sync.end();
    mapping.release();
  });

  return result;
};

export {
  dmabufTransaction
};
