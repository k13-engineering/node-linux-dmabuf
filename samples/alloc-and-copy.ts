import { openDmabufHeapAllocatorByDuppingFd } from "../lib/index.ts";
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
