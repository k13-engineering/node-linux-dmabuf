/* c8 ignore start */
import type {
  dmabufIoctlSyncEnd,
  dmabufIoctlSyncStart,
} from "./dmabuf-ioctl.ts";
import type { mmapFd } from "@k13engineering/po6-mmap";

type TDmabufIoctlSyncEndFunc = typeof dmabufIoctlSyncEnd;
type TDmabufIoctlSyncStartFunc = typeof dmabufIoctlSyncStart;
type TMmapFdFunc = typeof mmapFd;

type TLinuxDmabufInterface = {
  mmapFd: TMmapFdFunc;
  dmabufIoctlSyncEnd: TDmabufIoctlSyncEndFunc;
  dmabufIoctlSyncStart: TDmabufIoctlSyncStartFunc;
  dup: (args: { fd: number }) => number;
  fstat: (args: { fd: number }) => { inode: number; size: number };
  close: (args: { fd: number }) => void;
};

export type {
  TLinuxDmabufInterface
};
/* c8 ignore end */
