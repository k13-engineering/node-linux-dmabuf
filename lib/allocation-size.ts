const createDefaultAllocationSizeDeterminer = ({ pageSize }: { pageSize: number }) => {

  const determineOptimalAllocationSize = ({ minimumSize }: { minimumSize: number }): number => {
    const pagesNeeded = Math.ceil(minimumSize / pageSize);
    return pagesNeeded * pageSize;
  };

  return {
    determineOptimalAllocationSize
  };
};

export {
  createDefaultAllocationSizeDeterminer
};
