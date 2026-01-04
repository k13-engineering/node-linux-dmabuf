import type { TLinuxDmabufInterface } from "./linux-interface.ts";
import { mmapFd } from "@k13engineering/po6-mmap";
import { dmabufIoctlSyncStart, dmabufIoctlSyncEnd } from "./dmabuf-ioctl.ts";
import { syscall, syscallNumbers } from "syscall-napi";
import nodeFs from "node:fs";

const dup = ({ fd }: { fd: number }): number => {
  const { errno, ret: newFd } = syscall({
    syscallNumber: syscallNumbers.dup,
    args: [
      BigInt(fd)
    ]
  });

  if (errno !== undefined) {
    throw Error(`dup failed with errno ${errno}`);
  }

  return Number(newFd);
};

const fstat = ({ fd }: { fd: number }) => {
  const st = nodeFs.fstatSync(fd);
  return { inode: st.ino, size: st.size };
};

const close = ({ fd }: { fd: number }) => {
  nodeFs.closeSync(fd);
};

const createLinuxHostInterface = (): TLinuxDmabufInterface => {
  return {
    mmapFd,
    dmabufIoctlSyncEnd,
    dmabufIoctlSyncStart,
    dup,
    fstat,
    close
  };
};

export {
  createLinuxHostInterface
};
