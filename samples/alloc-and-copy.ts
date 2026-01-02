import { openDmabufHeapAllocatorByDuppingFd, transaction } from "../lib/index.ts";
import nodeFs from "node:fs";

const dmabufHeapPath = "/dev/dma_heap/system";

const dmabufHeapFd = nodeFs.openSync(dmabufHeapPath, nodeFs.constants.O_RDWR);
const dmabufHeapAllocator = openDmabufHeapAllocatorByDuppingFd({ dmabufHeapFd });

console.log(`opened dmabuf heap allocator for dmabuf heap at path ${dmabufHeapPath}`);

const allocateAsserted = ({ bufferSize }: { bufferSize: number }) => {
  const { error: allocationError, handle: bufferHandle } = dmabufHeapAllocator.allocate({
    size: dmabufHeapAllocator.determineOptimalAllocationSize({ minimumSize: bufferSize })
  });

  if (allocationError !== undefined) {
    throw Error(`failed to allocate dmabuf of size ${bufferSize}`, { cause: allocationError });
  }

  return bufferHandle;
};

const buffer1Handle = allocateAsserted({ bufferSize: 100 });
const buffer2Handle = allocateAsserted({ bufferSize: 200 });

console.log({
  buffer1Handle,
  buffer2Handle
});

console.log({
  buffer1Info: buffer1Handle.info(),
  buffer2Info: buffer2Handle.info()
});

transaction(({ useReadOnly, useWriteOnly, useReadWrite, copy }) => {
  // const b1 = useReadWrite({ handle: buffer1Handle });
  const b1 = useReadWrite({ handle: buffer1Handle });
  const b2 = useReadWrite({ handle: buffer2Handle });

  const testText = new TextEncoder().encode("Hello, dmabuf transfer!");
  b1.write({ offset: 0, data: testText });

  const readData = b1.read({ offset: 0, length: 10 });
  console.log({ readData });

  b2.write({ offset: 0, data: readData });

  copy({
    source: { handle: b1, offset: 0 },
    destination: { handle: b2, offset: 10 },
    length: 90
  });

  const readbackAfterCopy = b2.read({ offset: 5, length: 20 });
  console.log({ readbackAfterCopy });
});
