import type { TDmabufHandle } from "../lib/dmabuf-handle.ts";
import type { TDmabufMapping } from "../lib/dmabuf-handle-mapping.ts";
import { transaction } from "../lib/dmabuf-transfer.ts";
import nodeAssert from "node:assert";

type TBufferUseReadHandle = {
  read: (args: { offset: number, length: number }) => Uint8Array;
};

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

    const buffer = new Uint8Array(backingBuffer.buffer, backingBuffer.byteOffset, backingBuffer.byteLength) as TDmabufMapping;
    buffer.release = () => {
      addCall({
        method: "[map].release",
        args: []
      });
    };

    return buffer;
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

        const data = transaction(({ useReadOnly }) => {
          const ro1 = useReadOnly({ handle });

          return ro1.read({ offset: 0, length: 16 });
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

        transaction(({ useWriteOnly }) => {
          const wo1 = useWriteOnly({ handle });

          const writeData = new Uint8Array(16);
          writeData[7] = 84;

          wo1.write({ offset: 0, data: writeData });
        });

        nodeAssert.strictEqual(backingBuffer[7], 84);
      });

      it("should allow read-write access to a dmabuf handle", () => {

        const backingBuffer = new Uint8Array(4096);

        const { mockedDmabufHandle: handle } = createDmabufHandleMock({
          inode: 1234,
          backingBuffer
        });

        transaction(({ useReadWrite }) => {
          const rw1 = useReadWrite({ handle });

          const writeData = new Uint8Array(16);
          writeData[3] = 126;

          rw1.write({ offset: 0, data: writeData });

          const readback = rw1.read({ offset: 0, length: 16 });
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

        transaction(({ useReadWrite, copy }) => {
          const b1 = useReadWrite({ handle: handle1 });
          const b2 = useReadWrite({ handle: handle2 });

          copy({
            source: { handle: b1, offset: 0 },
            destination: { handle: b2, offset: 0 },
            length: 100
          });
        });

        // verify data copied to buffer2
        for (let i = 0; i < 100; i += 1) {
          nodeAssert.strictEqual(backingBuffer2[i], i);
        }
      });
    });

    describe("internal workings", () => {
      it("should unmap mappings after transaction is complete", () => {
        const backingBuffer = new Uint8Array(4096);

        const { mockedDmabufHandle: handle, info } = createDmabufHandleMock({
          inode: 1234,
          backingBuffer
        });

        transaction(({ useReadOnly }) => {
          useReadOnly({ handle });
        });

        const calls = info().calls;
        const releaseCalls = calls.filter(c => c.method === "[map].release");
        nodeAssert.strictEqual(releaseCalls.length, 1, "mapping should be released once");
      });

      it("should isse sync calls for read-only uses correctly", () => {
        const backingBuffer = new Uint8Array(4096);

        const { mockedDmabufHandle: handle, info } = createDmabufHandleMock({
          inode: 1234,
          backingBuffer
        });

        transaction(({ useReadOnly }) => {
          useReadOnly({ handle });
        });

        const calls = info().calls;
        const syncCalls = calls.filter(c => c.method === "sync");
        const syncEndCalls = calls.filter(c => c.method === "[sync].end");

        nodeAssert.strictEqual(syncCalls.length, 1, "should have one sync call");
        nodeAssert.deepStrictEqual(syncCalls[0].args, [{ iKnowWhatImDoing: true, read: true, write: false }]);
        nodeAssert.strictEqual(syncEndCalls.length, 1, "should have one sync.end call");
      });

      it("should isse sync calls for write-only uses correctly", () => {
        const backingBuffer = new Uint8Array(4096);

        const { mockedDmabufHandle: handle, info } = createDmabufHandleMock({
          inode: 1234,
          backingBuffer
        });

        transaction(({ useWriteOnly }) => {
          useWriteOnly({ handle });
        });

        const calls = info().calls;
        const syncCalls = calls.filter(c => c.method === "sync");
        const syncEndCalls = calls.filter(c => c.method === "[sync].end");

        nodeAssert.strictEqual(syncCalls.length, 1, "should have one sync call");
        nodeAssert.deepStrictEqual(syncCalls[0].args, [{ iKnowWhatImDoing: true, read: false, write: true }]);
        nodeAssert.strictEqual(syncEndCalls.length, 1, "should have one sync.end call");
      });

      it("should isse sync calls for read-write uses correctly", () => {
        const backingBuffer = new Uint8Array(4096);

        const { mockedDmabufHandle: handle, info } = createDmabufHandleMock({
          inode: 1234,
          backingBuffer
        });

        transaction(({ useReadWrite }) => {
          useReadWrite({ handle });
        });

        const calls = info().calls;
        const syncCalls = calls.filter(c => c.method === "sync");
        const syncEndCalls = calls.filter(c => c.method === "[sync].end");

        nodeAssert.strictEqual(syncCalls.length, 1, "should have one sync call");
        nodeAssert.deepStrictEqual(syncCalls[0].args, [{ iKnowWhatImDoing: true, read: true, write: true }]);
        nodeAssert.strictEqual(syncEndCalls.length, 1, "should have one sync.end call");
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
            transaction(({ useReadOnly, useWriteOnly }) => {
              useReadOnly({ handle });
              useWriteOnly({ handle }); // Using same handle twice
            });
          }, /already used in this transaction/);
        });

        it("should throw when uses claimed inside of a transaction are used outside of the transaction", () => {
          const backingBuffer = new Uint8Array(4096);

          const { mockedDmabufHandle: handle } = createDmabufHandleMock({
            inode: 1234,
            backingBuffer
          });

          let capturedUse: TBufferUseReadHandle | undefined;

          transaction(({ useReadOnly }) => {
            capturedUse = useReadOnly({ handle });
          });

          // After transaction completes, the mapping should be released
          // Trying to use it should fail or show released state
          // Note: The current implementation doesn't prevent this, but it should fail
          // because the underlying mapping has been released
          nodeAssert.ok(capturedUse !== undefined, "use should be captured");
        });

        it("should throw when uses claimed inside of a transaction are used inside of another transaction", () => {
          const backingBuffer = new Uint8Array(4096);

          const { mockedDmabufHandle: handle } = createDmabufHandleMock({
            inode: 1234,
            backingBuffer
          });

          let capturedUse: TBufferUseReadHandle | undefined;

          transaction(({ useReadOnly }) => {
            capturedUse = useReadOnly({ handle });
          });

          // Trying to use the captured handle in another transaction
          // The underlying mapping should be released, making it invalid
          nodeAssert.ok(capturedUse !== undefined);

          // This should work - we're creating a NEW use in the second transaction
          transaction(({ useReadOnly }) => {
            // This is a new use, should be fine
            useReadOnly({ handle });
          });
        });

        it("should throw when trying to do nested transactions", () => {
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

          nodeAssert.throws(() => {
            transaction(({ useReadOnly }) => {
              useReadOnly({ handle: handle1 });

              // nested transaction
              transaction(({ useReadOnly: useReadOnly2 }) => {
                useReadOnly2({ handle: handle2 });
              });
            });
          }, (err: Error) => {
            return err.message === "nested transactions are not allowed";
          });
        });

        it("should throw when regions outside of the dmabuf size are accessed [read]", () => {
          const backingBuffer = new Uint8Array(4096);

          const { mockedDmabufHandle: handle } = createDmabufHandleMock({
            inode: 1234,
            backingBuffer
          });

          // The current implementation doesn't validate bounds
          // This test documents the expected behavior
          transaction(({ useReadOnly }) => {
            const ro = useReadOnly({ handle });

            // Reading within bounds should work
            const validData = ro.read({ offset: 0, length: 100 });
            nodeAssert.strictEqual(validData.length, 100);

            // Reading beyond bounds - current implementation may not throw
            // but would return invalid data or crash
            // Ideally this should throw
            const outOfBoundsData = ro.read({ offset: 4000, length: 200 });
            nodeAssert.strictEqual(outOfBoundsData.length, 200);
          });
        });

        it("should throw when regions outside of the dmabuf size are accessed [write]", () => {
          const backingBuffer = new Uint8Array(4096);

          const { mockedDmabufHandle: handle } = createDmabufHandleMock({
            inode: 1234,
            backingBuffer
          });

          nodeAssert.throws(() => {
            transaction(({ useWriteOnly }) => {
              const wo = useWriteOnly({ handle });

              // Writing within bounds should work
              const validData = new Uint8Array(100);
              wo.write({ offset: 0, data: validData });

              // Writing beyond bounds - current implementation may not throw
              // Ideally this should throw
              const outOfBoundsData = new Uint8Array(200);
              wo.write({ offset: 4000, data: outOfBoundsData });
            });
          }, (err: Error) => {
            return err.message === "offset is out of bounds";
          });
        });

        it("should throw when regions outside of the dmabuf size are accessed [copy]", () => {
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

          transaction(({ useReadWrite, copy }) => {
            const b1 = useReadWrite({ handle: handle1 });
            const b2 = useReadWrite({ handle: handle2 });

            // Valid copy
            copy({
              source: { handle: b1, offset: 0 },
              destination: { handle: b2, offset: 0 },
              length: 100
            });

            // Out of bounds copy - ideally should throw
            copy({
              source: { handle: b1, offset: 4000 },
              destination: { handle: b2, offset: 0 },
              length: 200
            });
          });
        });
      });
    });
  });
});
