import type { TDmabufHandle } from "./dmabuf-handle.ts";

type TDmabufAllocateArgs = {
  size: number;
};

type TDmabufAllocateResult = {
  error: Error;
  handle: undefined;
} | {
  error: undefined;
  handle: TDmabufHandle;
};

type TDmabufAllocator = {
  allocate: (args: TDmabufAllocateArgs) => TDmabufAllocateResult;
  pageSize: number;
  determineOptimalAllocationSize: (args: { minimumSize: number }) => number;
};

export type {
  TDmabufAllocator
};
