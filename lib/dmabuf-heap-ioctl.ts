import { ioctl } from "@k13engineering/po6-ioctl";
import { hostEndianBufferViewFor } from "./endian-buffer.ts";

type TDmabufHeapIoctlAllocateResult = {
  errno: undefined;
  dmabufFd: number;
} | {
  errno: number;
  dmabufFd: undefined;
};

const formatAllocationData = ({
  len,
  fdFlags,
  heapFlags
}: {
  len: number;
  fdFlags: bigint;
  heapFlags: bigint;
}) => {

  const allocationData = new Uint8Array(24);

  const view = hostEndianBufferViewFor({ buffer: allocationData });

  // struct dma_heap_allocation_data {
  //   __u64 len
  view.writeU64({ offset: 0, value: BigInt(len) });
  //   __u32 fd
  view.writeU32({ offset: 8, value: 0 });
  //   __u32 fd_flags
  view.writeU32({ offset: 12, value: Number(fdFlags) });
  //   __u64 heap_flags
  view.writeU64({ offset: 16, value: heapFlags });
  // }

  return allocationData;
};

const DMA_HEAP_IOCTL_ALLOC = BigInt(0xc0184800);

const dmabufHeapIoctlAllocate = ({
  dmabufHeapFd,
  size,
  fdFlags,
  heapFlags
}: {
  dmabufHeapFd: number;
  size: number;
  fdFlags: bigint;
  heapFlags: bigint;
}): TDmabufHeapIoctlAllocateResult => {

  const allocationData = formatAllocationData({
    len: size,
    fdFlags,
    heapFlags
  });

  const { errno } = ioctl({
    fd: dmabufHeapFd,
    request: DMA_HEAP_IOCTL_ALLOC,
    arg: allocationData
  });

  if (errno !== undefined) {
    return {
      errno,
      dmabufFd: undefined
    };
  }

  const view = hostEndianBufferViewFor({ buffer: allocationData });
  const dmabufFd = view.readU32({ offset: 8 });

  return {
    errno: undefined,
    dmabufFd
  };
};

export {
  dmabufHeapIoctlAllocate
};
