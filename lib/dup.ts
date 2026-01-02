import { syscall, syscallNumbers } from "syscall-napi";

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

export {
  dup
};
