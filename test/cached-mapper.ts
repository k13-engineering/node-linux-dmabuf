import assert from "node:assert";
import { createCachedMapper } from "../lib/cached-mapper.ts";
import type { TMemoryMapping } from "@k13engineering/po6-mmap";
const createMockMapping = ({
  length,
  byteOffset = 0,
  onUnmap = () => { },
  arrayBuffer,
}: {
  length: number;
  byteOffset?: number;
  onUnmap?: () => void;
  arrayBuffer?: ArrayBuffer;
}): TMemoryMapping => {
  const buffer = arrayBuffer ?? new ArrayBuffer(byteOffset + length);
  return {
    address: 0n,
    length,
    createArrayBuffer: () => buffer,
    unmap: onUnmap,
  };
};
describe("cached-mapper", () => {
  describe("createCachedMapper", () => {
    it("should create a cached mapper with expected methods", () => {
      const mapper = createCachedMapper({
        map: () => {
          return createMockMapping({ length: 32 });
        },
      });

      assert.strictEqual(typeof mapper.maybeMap, "function");
      assert.strictEqual(typeof mapper.mapped, "function");
      assert.strictEqual(typeof mapper.close, "function");
    });
  });

  describe("maybeMap", () => {
    it("should map on first call", () => {
      let mapCallCount = 0;
      const length = 100;

      const mapper = createCachedMapper({
        map: () => {
          mapCallCount += 1;
          return createMockMapping({ length });
        },
      });

      const result = mapper.maybeMap();
      assert.strictEqual(mapCallCount, 1);
      assert.strictEqual(result.length, length);
      assert.strictEqual(typeof result.release, "function");
      assert.strictEqual(typeof result.createArrayBuffer, "function");

      result.release();
    });

    it("should reuse existing mapping on subsequent calls", () => {
      let mapCallCount = 0;
      const mapper = createCachedMapper({
        map: () => {
          mapCallCount += 1;
          return createMockMapping({ length: 32 });
        },
      });

      const result1 = mapper.maybeMap();
      const result2 = mapper.maybeMap();

      assert.strictEqual(mapCallCount, 1, "map should only be called once");
      assert.strictEqual(result1.length, result2.length);

      result1.release();
      result2.release();
    });

    it("should increment refcount for each call", () => {
      let unmapCallCount = 0;
      const mapper = createCachedMapper({
        map: () => {
          return createMockMapping({
            length: 32,
            onUnmap: () => {
              unmapCallCount += 1;
            },
          });
        },
      });

      const result1 = mapper.maybeMap();
      const result2 = mapper.maybeMap();
      const result3 = mapper.maybeMap();

      assert.strictEqual(unmapCallCount, 0, "unmap should not be called yet");

      result1.release();
      assert.strictEqual(unmapCallCount, 0, "unmap should not be called after first release");

      result2.release();
      assert.strictEqual(unmapCallCount, 0, "unmap should not be called after second release");

      result3.release();
      assert.strictEqual(unmapCallCount, 1, "unmap should be called after all releases");
    });

    it("should create independent Uint8Array views for each call", () => {
      const mapper = createCachedMapper({
        map: () => {
          return createMockMapping({ length: 32 });
        },
      });

      const result1 = mapper.maybeMap();
      const result2 = mapper.maybeMap();

      // Should be separate objects
      assert.notStrictEqual(result1, result2);

      // But should share the same underlying buffer via createArrayBuffer
      const buffer1 = result1.createArrayBuffer();
      const buffer2 = result2.createArrayBuffer();
      assert.strictEqual(buffer1, buffer2);

      // Modifications through one view should be visible through the other
      const view1 = new Uint8Array(buffer1);
      const view2 = new Uint8Array(buffer2);
      view1[0] = 255;
      assert.strictEqual(view2[0], 255);

      result1.release();
      result2.release();
    });

    it("should remap after all references are released", () => {
      let mapCallCount = 0;
      let unmapCallCount = 0;

      const mapper = createCachedMapper({
        map: () => {
          mapCallCount += 1;
          return createMockMapping({
            length: 32,
            onUnmap: () => {
              unmapCallCount += 1;
            },
          });
        },
      });

      // First mapping cycle
      const result1 = mapper.maybeMap();
      result1.release();

      assert.strictEqual(mapCallCount, 1);
      assert.strictEqual(unmapCallCount, 1);

      // Second mapping cycle
      const result2 = mapper.maybeMap();
      result2.release();

      assert.strictEqual(mapCallCount, 2, "should remap after all releases");
      assert.strictEqual(unmapCallCount, 2, "should unmap again");
    });
  });

  describe("release", () => {
    it("should throw error when release is called twice on same reference", () => {
      const mapper = createCachedMapper({
        map: () => {
          return createMockMapping({ length: 100 });
        },
      });

      const result = mapper.maybeMap();
      result.release();

      assert.throws(() => {
        result.release();
      }, /handle already released/);
    });

    it("should allow other references to be released after one is double-released", () => {
      const mapper = createCachedMapper({
        map: () => {
          return createMockMapping({ length: 100 });
        },
      });

      const result1 = mapper.maybeMap();
      const result2 = mapper.maybeMap();

      result1.release();

      assert.throws(() => {
        result1.release();
      }, /handle already released/);

      // result2 should still be releasable
      assert.doesNotThrow(() => {
        result2.release();
      });
    });

    it("should handle releasing in different order than acquisition", () => {
      let unmapCallCount = 0;
      const mapper = createCachedMapper({
        map: () => {
          return createMockMapping({
            length: 100,
            onUnmap: () => {
              unmapCallCount += 1;
            },
          });
        },
      });

      const result1 = mapper.maybeMap();
      const result2 = mapper.maybeMap();
      const result3 = mapper.maybeMap();

      // Release in reverse order
      result3.release();
      result1.release();
      result2.release();

      assert.strictEqual(unmapCallCount, 1, "should unmap exactly once");
    });

    it("should verify refcount integrity by checking BUG messages", () => {
      const mapper = createCachedMapper({
        map: () => {
          return createMockMapping({ length: 100 });
        },
      });

      const result = mapper.maybeMap();
      result.release();

      // After releasing all references, trying to release again should show double-release error
      // not the BUG error, because the `released` flag is checked first
      assert.throws(() => {
        result.release();
      }, /handle already released/);
    });
  });

  describe("mapped", () => {
    it("should return false initially", () => {
      const mapper = createCachedMapper({
        map: () => {
          return createMockMapping({ length: 100 });
        },
      });

      assert.strictEqual(mapper.mapped(), false);
    });

    it("should return true after mapping", () => {
      const mapper = createCachedMapper({
        map: () => {
          return createMockMapping({ length: 100 });
        },
      });

      const result = mapper.maybeMap();
      assert.strictEqual(mapper.mapped(), true);

      result.release();
    });

    it("should return true while references exist", () => {
      const mapper = createCachedMapper({
        map: () => {
          return createMockMapping({ length: 100 });
        },
      });

      const result1 = mapper.maybeMap();
      const result2 = mapper.maybeMap();

      assert.strictEqual(mapper.mapped(), true);

      result1.release();
      assert.strictEqual(mapper.mapped(), true, "should still be mapped with one reference");

      result2.release();
      assert.strictEqual(mapper.mapped(), false, "should be unmapped after all releases");
    });

    it("should return false after all references are released", () => {
      const mapper = createCachedMapper({
        map: () => {
          return createMockMapping({ length: 100 });
        },
      });

      const result = mapper.maybeMap();
      result.release();

      assert.strictEqual(mapper.mapped(), false);
    });

    it("should alternate between true and false across mapping cycles", () => {
      const mapper = createCachedMapper({
        map: () => {
          return createMockMapping({ length: 100 });
        },
      });

      assert.strictEqual(mapper.mapped(), false);

      const result1 = mapper.maybeMap();
      assert.strictEqual(mapper.mapped(), true);
      result1.release();
      assert.strictEqual(mapper.mapped(), false);

      const result2 = mapper.maybeMap();
      assert.strictEqual(mapper.mapped(), true);
      result2.release();
      assert.strictEqual(mapper.mapped(), false);
    });
  });

  describe("close", () => {
    it("should exist as a method", () => {
      const mapper = createCachedMapper({
        map: () => {
          return createMockMapping({ length: 100 });
        },
      });

      assert.strictEqual(typeof mapper.close, "function");
    });

    it("should not throw when called", () => {
      const mapper = createCachedMapper({
        map: () => {
          return createMockMapping({ length: 100 });
        },
      });

      assert.doesNotThrow(() => {
        mapper.close();
      });
    });

    it("should be callable even with active mappings", () => {
      const mapper = createCachedMapper({
        map: () => {
          return createMockMapping({ length: 100 });
        },
      });

      const result = mapper.maybeMap();

      assert.doesNotThrow(() => {
        mapper.close();
      });

      result.release();
    });

    it("should be callable multiple times", () => {
      const mapper = createCachedMapper({
        map: () => {
          return createMockMapping({ length: 100 });
        },
      });

      assert.doesNotThrow(() => {
        mapper.close();
        mapper.close();
        mapper.close();
      });
    });
  });

  describe("edge cases and potential bugs", () => {
    it("should handle zero-length buffers", () => {
      const mapper = createCachedMapper({
        map: () => {
          return createMockMapping({ length: 0 });
        },
      });

      const result = mapper.maybeMap();
      assert.strictEqual(result.length, 0);
      assert.doesNotThrow(() => {
        result.release();
      });
    });

    it("should handle large byteOffset values", () => {
      const mapper = createCachedMapper({
        map: () => {
          const buffer = new ArrayBuffer(1000);
          return createMockMapping({
            length: 100,
            byteOffset: 900,
            arrayBuffer: buffer,
          });
        },
      });

      const result = mapper.maybeMap();
      assert.strictEqual(result.length, 100);
      const buffer = result.createArrayBuffer();
      assert.strictEqual(buffer.byteLength, 1000);
      result.release();
    });

    it("should handle map function throwing an error on first call", () => {
      const mapper = createCachedMapper({
        map: () => {
          throw new Error("mapping failed");
        },
      });

      assert.throws(() => {
        mapper.maybeMap();
      }, /mapping failed/);
    });

    it("should handle map function throwing an error after successful map", () => {
      let callCount = 0;
      const mapper = createCachedMapper({
        map: () => {
          callCount += 1;
          if (callCount === 1) {
            return createMockMapping({ length: 100 });
          }
          throw new Error("second mapping failed");
        },
      });

      const result1 = mapper.maybeMap();
      result1.release();

      // Second mapping should fail
      assert.throws(() => {
        mapper.maybeMap();
      }, /second mapping failed/);
    });

    it("should handle unmap throwing an error", () => {
      const mapper = createCachedMapper({
        map: () => {
          return createMockMapping({
            length: 100,
            onUnmap: () => {
              throw new Error("unmap failed");
            },
          });
        },
      });

      const result = mapper.maybeMap();

      assert.throws(() => {
        result.release();
      }, /unmap failed/);

      // After unmap error, internal state might be inconsistent
      // Check what happens with mapper.mapped()
      // This test reveals potential bugs in error handling
    });

    it("should verify that each reference has its own released flag", () => {
      const mapper = createCachedMapper({
        map: () => {
          return createMockMapping({ length: 100 });
        },
      });

      const result1 = mapper.maybeMap();
      const result2 = mapper.maybeMap();

      result1.release();

      // result1 should not be releasable again
      assert.throws(() => {
        result1.release();
      }, /handle already released/);

      // But result2 should still be releasable
      assert.doesNotThrow(() => {
        result2.release();
      });
    });

    it("should handle many concurrent references", () => {
      let unmapCallCount = 0;
      const mapper = createCachedMapper({
        map: () => {
          return createMockMapping({
            length: 100,
            onUnmap: () => {
              unmapCallCount += 1;
            },
          });
        },
      });

      const references = [];
      for (let i = 0; i < 100; i += 1) {
        references.push(mapper.maybeMap());
      }

      assert.strictEqual(mapper.mapped(), true);

      // Release all but one
      for (let i = 0; i < 99; i += 1) {
        references[i].release();
      }

      assert.strictEqual(unmapCallCount, 0);
      assert.strictEqual(mapper.mapped(), true);

      // Release the last one
      references[99].release();
      assert.strictEqual(unmapCallCount, 1);
      assert.strictEqual(mapper.mapped(), false);
    });

    it("should verify release method is not shared between references", () => {
      const mapper = createCachedMapper({
        map: () => {
          return createMockMapping({ length: 100 });
        },
      });

      const result1 = mapper.maybeMap();
      const result2 = mapper.maybeMap();

      // Each reference should have its own release function
      assert.notStrictEqual(result1.release, result2.release);

      result1.release();
      result2.release();
    });

    it("should handle buffer modifications through different references", () => {
      const mapper = createCachedMapper({
        map: () => {
          return createMockMapping({ length: 100 });
        },
      });

      const result1 = mapper.maybeMap();
      const result2 = mapper.maybeMap();

      const view1 = new Uint8Array(result1.createArrayBuffer());
      const view2 = new Uint8Array(result2.createArrayBuffer());

      view1[0] = 42;
      view1[1] = 43;

      assert.strictEqual(view2[0], 42);
      assert.strictEqual(view2[1], 43);

      view2[2] = 44;
      assert.strictEqual(view1[2], 44);

      result1.release();
      result2.release();
    });
  });

  describe("integration scenarios", () => {
    it("should support typical usage pattern: map, use, release", () => {
      const mapper = createCachedMapper({
        map: () => {
          const buffer = new ArrayBuffer(100);
          const view = new Uint8Array(buffer);
          for (let i = 0; i < 100; i += 1) {
            view[i] = i;
          }
          return createMockMapping({ length: 100, arrayBuffer: buffer });
        },
      });

      const mapped = mapper.maybeMap();

      // Use the buffer
      const view = new Uint8Array(mapped.createArrayBuffer());
      let sum = 0;
      for (let i = 0; i < mapped.length; i += 1) {
        sum += view[i];
      }

      // sum of 0..99
      assert.strictEqual(sum, 4950);

      mapped.release();
      assert.strictEqual(mapper.mapped(), false);
    });

    it("should support pattern: map multiple times, use all, release all", () => {
      let unmapCount = 0;
      const mapper = createCachedMapper({
        map: () => {
          return createMockMapping({
            length: 100,
            onUnmap: () => {
              unmapCount += 1;
            },
          });
        },
      });

      const refs = [
        mapper.maybeMap(),
        mapper.maybeMap(),
        mapper.maybeMap(),
      ];

      // Use all references
      for (const ref of refs) {
        const view = new Uint8Array(ref.createArrayBuffer());
        view[0] = 255;
      }

      // Release all
      for (const ref of refs) {
        ref.release();
      }

      assert.strictEqual(unmapCount, 1);
      assert.strictEqual(mapper.mapped(), false);
    });

    it("should support pattern: map, release, map again", () => {
      let mapCount = 0;
      const mapper = createCachedMapper({
        map: () => {
          mapCount += 1;
          const buffer = new ArrayBuffer(100);
          const view = new Uint8Array(buffer);
          view[0] = mapCount;
          return createMockMapping({ length: 100, arrayBuffer: buffer });
        },
      });

      const ref1 = mapper.maybeMap();
      const view1 = new Uint8Array(ref1.createArrayBuffer());
      assert.strictEqual(view1[0], 1);
      ref1.release();

      const ref2 = mapper.maybeMap();
      const view2 = new Uint8Array(ref2.createArrayBuffer());
      assert.strictEqual(view2[0], 2);
      ref2.release();

      assert.strictEqual(mapCount, 2);
    });
  });
});
