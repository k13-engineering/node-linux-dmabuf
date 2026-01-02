const isADmaBuf = ({ fd }: { fd: number }): boolean => {
  // TODO: implement

  return fd >= 0;
};

const assertFdIsValid = ({ fd }: { fd: number }): void => {
  if (fd < 0) {
    throw Error(`fd ${fd} is not valid`);
  }
};

const assertIsADmaBuf = ({ dmabufFd }: { dmabufFd: number }): void => {
  if (!isADmaBuf({ fd: dmabufFd })) {
    throw Error(`fd ${dmabufFd} is not a valid dmabuf fd`);
  }
};

export {
  isADmaBuf,
  assertFdIsValid,
  assertIsADmaBuf
};
