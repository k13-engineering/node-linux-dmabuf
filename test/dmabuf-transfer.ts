import type { TDmabufHandle, TDmabufMapping } from "../lib/index.ts";
import { dmabufTransaction } from "../lib/index.ts";
import nodeAssert from "node:assert";

type TDmabufMockCall = {
  method: string;
  args: unknown[];
};

type TDmabufMockInfo = {
  calls: TDmabufMockCall[]
};

type TDmabufHandleMock = {
  mockedDmabufHandle: TDmabufHandle;
  info: () => TDmabufMockInfo;
};

let mockMappingIdCounter = 0;

const createDmabufHandleMock = ({
  inode,
  backingBuffer
}: {
  inode: number;
  backingBuffer: Uint8Array;
}): TDmabufHandleMock => {

  let calls: TDmabufMockCall[] = [];

  const addCall = (call: TDmabufMockCall) => {
    calls = [...calls, call];
  };

  const exportAndDupAsDmabufFd: TDmabufHandle["exportAndDupAsDmabufFd"] = (...args) => {
    addCall({
      method: "exportAndDupAsDmabufFd",
      args
    });

    return { dmabufFd: 42 };
  };

  const info: TDmabufHandle["info"] = () => {
    addCall({
      method: "info",
      args: []
    });

    return {
      inode,
      size: backingBuffer.length
    };
  };

  const sync: TDmabufHandle["sync"] = (...args) => {
    addCall({
      method: "sync",
      args
    });

    const end = () => {
      addCall({
        method: "[sync].end",
        args: []
      });
    };

    return {
      end
    };
  };

  const map: TDmabufHandle["map"] = (...args) => {
    addCall({
      method: "map",
      args
    });

    const mappingId = mockMappingIdCounter;
    mockMappingIdCounter += 1;

    const mapping: TDmabufMapping = {
      mappingId,
      address: 0n,
      length: backingBuffer.length,
      createArrayBuffer: () => {
        return backingBuffer.buffer as ArrayBuffer;
      },
      release: () => {
        addCall({
          method: "[map].release",
          args: []
        });
      }
    };

    return mapping;
  };

  const close: TDmabufHandle["close"] = (...args) => {
    addCall({
      method: "close",
      args
    });
  };

  const mockedDmabufHandle: TDmabufHandle = {
    exportAndDupAsDmabufFd,
    info,
    sync,
    map,
    close
  };

  return {
    mockedDmabufHandle,

    info: () => {
      return {
        calls
      };
    }
  };
};

describe("dmabuf-transfer", () => {
  describe("transaction", () => {

    describe("good cases", () => {
      it("should allow reading from a dmabuf handle", () => {

        const backingBuffer = new Uint8Array(4096);
        backingBuffer[4] = 42;

        const { mockedDmabufHandle: handle } = createDmabufHandleMock({
          inode: 1234,
          backingBuffer
        });

        const data = dmabufTransaction(({ use }) => {
          const ro1 = use({ handle, access: { read: "required", write: "crash-process-on-write" } });

          const result = new Uint8Array(16);
          result.set(ro1.subarray(0, 16));

          return result;
        });

        nodeAssert.strictEqual(data.length, 16);
        nodeAssert.strictEqual(data[4], 42);
      });

      it("should allow writing to a dmabuf handle", () => {

        const backingBuffer = new Uint8Array(4096);

        const { mockedDmabufHandle: handle } = createDmabufHandleMock({
          inode: 1234,
          backingBuffer
        });

        dmabufTransaction(({ use }) => {
          const wo1 = use({ handle, access: { read: "crash-process-on-read", write: "required" } });

          const writeData = new Uint8Array(16);
          writeData[7] = 84;

          wo1.set(writeData, 42);
        });

        nodeAssert.strictEqual(backingBuffer[42 + 7], 84);
      });

      it("should allow read-write access to a dmabuf handle", () => {

        const backingBuffer = new Uint8Array(4096);

        const { mockedDmabufHandle: handle } = createDmabufHandleMock({
          inode: 1234,
          backingBuffer
        });

        dmabufTransaction(({ use }) => {
          const rw1 = use({ handle, access: { read: "required", write: "required" } });

          const writeData = new Uint8Array(16);
          writeData[3] = 126;

          rw1.set(writeData, 0);

          const readback = new Uint8Array(16);
          readback.set(rw1.subarray(0, 16));

          nodeAssert.strictEqual(readback[3], 126);
        });

        nodeAssert.strictEqual(backingBuffer[3], 126);
      });

      it("should allow copying between two dmabuf handles", () => {
        const backingBuffer1 = new Uint8Array(4096);
        const backingBuffer2 = new Uint8Array(4096);

        const { mockedDmabufHandle: handle1 } = createDmabufHandleMock({
          inode: 1234,
          backingBuffer: backingBuffer1
        });

        const { mockedDmabufHandle: handle2 } = createDmabufHandleMock({
          inode: 5678,
          backingBuffer: backingBuffer2
        });

        // initialize buffer1
        for (let i = 0; i < 100; i += 1) {
          backingBuffer1[i] = i;
        }

        dmabufTransaction(({ use }) => {
          const b1 = use({ handle: handle1, access: { read: "required", write: "required" } });
          const b2 = use({ handle: handle2, access: { read: "required", write: "required" } });

          b2.set(b1.subarray(0, 100), 0);
        });

        // verify data copied to buffer2
        for (let i = 0; i < 100; i += 1) {
          nodeAssert.strictEqual(backingBuffer2[i], i);
        }
      });
    });

    describe("internal workings", () => {
      it("should map/sync 1 read-only buffer correctly", () => {
        const backingBuffer = new Uint8Array(4096);

        const { mockedDmabufHandle: handle, info } = createDmabufHandleMock({
          inode: 1234,
          backingBuffer
        });

        dmabufTransaction(({ use }) => {
          use({ handle, access: { read: "required", write: "crash-process-on-write" } });
        });

        const calls = info().calls;

        nodeAssert.deepStrictEqual(calls, [
          {
            method: "map",
            args: [{
              iKnowWhatImDoing: true,
              access: { read: "required", write: "forbidden" }
            }]
          },
          {
            method: "sync",
            args: [{ iKnowWhatImDoing: true, read: true, write: false }]
          },
          {
            method: "[sync].end",
            args: []
          },
          {
            method: "[map].release",
            args: []
          }
        ] as TDmabufMockCall[]);
      });

      it("should map/sync 1 write-only buffer correctly", () => {
        const backingBuffer = new Uint8Array(4096);

        const { mockedDmabufHandle: handle, info } = createDmabufHandleMock({
          inode: 1234,
          backingBuffer
        });

        dmabufTransaction(({ use }) => {
          use({ handle, access: { read: "crash-process-on-read", write: "required" } });
        });

        const calls = info().calls;

        nodeAssert.deepStrictEqual(calls, [
          {
            method: "map",
            args: [{
              iKnowWhatImDoing: true,
              access: { read: "forbidden", write: "required" }
            }]
          },
          {
            method: "sync",
            args: [{ iKnowWhatImDoing: true, read: false, write: true }]
          },
          {
            method: "[sync].end",
            args: []
          },
          {
            method: "[map].release",
            args: []
          }
        ] as TDmabufMockCall[]);
      });
    });

    describe("error cases", () => {
      describe("invalid uses", () => {
        it("should throw when same dmabuf handle is used more than once in a transaction", () => {
          const backingBuffer = new Uint8Array(4096);

          const { mockedDmabufHandle: handle } = createDmabufHandleMock({
            inode: 1234,
            backingBuffer
          });

          nodeAssert.throws(() => {
            dmabufTransaction(({ use }) => {
              use({ handle, access: { read: "required", write: "crash-process-on-write" } });
              use({ handle, access: { read: "crash-process-on-read", write: "required" } });
            });
          }, /already used in this transaction/);
        });

        it.skip("should throw when uses claimed inside of a transaction are used outside of the transaction", () => {
          const backingBuffer = new Uint8Array(4096);

          const { mockedDmabufHandle: handle } = createDmabufHandleMock({
            inode: 1234,
            backingBuffer
          });

          let capturedUse: Uint8Array | undefined;

          dmabufTransaction(({ use }) => {
            capturedUse = use({ handle, access: { read: "required", write: "crash-process-on-write" } });
          });

          nodeAssert.ok(capturedUse !== undefined);
        });

        it.skip("should throw when uses claimed inside of a transaction are used inside of another transaction", () => {
          const backingBuffer = new Uint8Array(4096);

          const { mockedDmabufHandle: handle } = createDmabufHandleMock({
            inode: 1234,
            backingBuffer
          });

          let capturedUse: Uint8Array | undefined;

          dmabufTransaction(({ use }) => {
            capturedUse = use({ handle, access: { read: "required", write: "crash-process-on-write" } });
          });

          nodeAssert.ok(capturedUse !== undefined);

          dmabufTransaction(() => {
            // TODO: implement here
          });
        });

        it("should throw when trying to do nested transactions", () => {
          const backingBuffer = new Uint8Array(4096);

          const { mockedDmabufHandle: handle } = createDmabufHandleMock({
            inode: 1234,
            backingBuffer
          });

          nodeAssert.throws(() => {
            dmabufTransaction(({ use }) => {
              use({ handle, access: { read: "required", write: "required" } });

              // nested transaction
              dmabufTransaction(() => {

              });
            });
          }, (err: Error) => {
            return err.message === "nested transactions are not allowed";
          });
        });
      });
    });
  });
});
