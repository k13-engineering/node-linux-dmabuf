import { ioctl } from "@k13engineering/po6-ioctl";
import nodeOs from "node:os";

const endianness = nodeOs.endianness();

const flagsToFlagsBuffer = ({ flags }: { flags: bigint }) => {
  const flagBuffer = Buffer.alloc(8);
  if (endianness === "LE") {
    flagBuffer.writeBigUInt64LE(flags, 0);
  } else {
    flagBuffer.writeBigUInt64BE(flags, 0);
  }
  return flagBuffer;
};

const DMA_BUF_IOCTL_SYNC = BigInt(0x40086200);

const DMA_BUF_SYNC_READ = BigInt(0x1);
const DMA_BUF_SYNC_WRITE = BigInt(0x2);
const DMA_BUF_SYNC_START = BigInt(0x00);
const DMA_BUF_SYNC_END = BigInt(0x4);

const dmabufIoctlSync = ({ dmabufFd, flags }: { dmabufFd: number, flags: bigint }) => {

  const flagBuffer = flagsToFlagsBuffer({ flags });

  const { errno } = ioctl({
    fd: dmabufFd,
    request: DMA_BUF_IOCTL_SYNC,
    arg: flagBuffer
  });

  if (errno !== undefined) {
    throw Error(`dmabuf ioctl sync start failed with errno ${errno}`);
  }
};

const dmabufIoctlSyncStart = ({ dmabufFd, read, write }: { dmabufFd: number, read: boolean; write: boolean }) => {

  let flags = DMA_BUF_SYNC_START;
  if (read) {
    flags |= DMA_BUF_SYNC_READ;
  }
  if (write) {
    flags |= DMA_BUF_SYNC_WRITE;
  }

  dmabufIoctlSync({ dmabufFd, flags });
};

const dmabufIoctlSyncEnd = ({ dmabufFd, read, write }: { dmabufFd: number, read: boolean; write: boolean }) => {

  let flags = DMA_BUF_SYNC_END;
  if (read) {
    flags |= DMA_BUF_SYNC_READ;
  }
  if (write) {
    flags |= DMA_BUF_SYNC_WRITE;
  }

  dmabufIoctlSync({ dmabufFd, flags });
};

export {
  dmabufIoctlSyncStart,
  dmabufIoctlSyncEnd
};
