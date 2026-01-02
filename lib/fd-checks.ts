const isADmaBuf = ({ fd }: { fd: number }): boolean => {
  // TODO: implement
  return true;
};

const assertFdIsValid = ({ fd }: { fd: number }): void => {

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
