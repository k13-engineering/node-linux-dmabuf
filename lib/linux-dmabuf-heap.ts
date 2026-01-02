import { determinePageSize } from "@k13engineering/po6-mmap";
import type { TDmabufAllocator } from "./dmabuf-allocator-interface.ts";
import { dup } from "./dup.ts";
import { createDefaultAllocationSizeDeterminer } from "./allocation-size.ts";
import { dmabufHeapIoctlAllocate } from "./dmabuf-heap-ioctl.ts";
import { importAndDupDmabuf } from "./dmabuf-handle.ts";
// import nodeFs from "node:fs";

type TDmabufHeap = TDmabufAllocator;

const O_RDWR = BigInt(0x02);
const O_CLOEXEC = BigInt(0x80000);

const openDmabufHeapAllocatorByDuppingFd = ({
  dmabufHeapFd: providedDmabufHeapFd
}: {
  dmabufHeapFd: number
}): TDmabufHeap => {

  const dmabufHeapFd = dup({ fd: providedDmabufHeapFd });
  const pageSize = determinePageSize();

  console.log({ dmabufHeapFd });

  const allocationSizeDeterminer = createDefaultAllocationSizeDeterminer({ pageSize });

  const determineOptimalAllocationSize: TDmabufHeap["determineOptimalAllocationSize"] = ({ minimumSize }) => {
    return allocationSizeDeterminer.determineOptimalAllocationSize({ minimumSize });
  };

  const allocate: TDmabufHeap["allocate"] = ({ size }) => {

    const { errno: allocateErrno, dmabufFd } = dmabufHeapIoctlAllocate({
      dmabufHeapFd,
      fdFlags: O_RDWR | O_CLOEXEC,
      heapFlags: BigInt(0),
      size
    });

    if (allocateErrno !== undefined) {
      return {
        // TODO: better
        error: Error(`dmabuf heap allocation failed with errno ${allocateErrno}`),
        handle: undefined
      };
    }

    const handle = importAndDupDmabuf({ dmabufFd });

    return {
      error: undefined,
      handle
    };
  };

  return {
    allocate,
    pageSize,
    determineOptimalAllocationSize
  };
};

// const openDmabufHeapAllocatorByName = ({ dmabufHeapName }: { dmabufHeapName: string }): TDmabufHeap => {

// };

export {
  openDmabufHeapAllocatorByDuppingFd
};
