import nodeFs from "node:fs";

type TDmabufHeapFinder = {
  findByName: (args: { dmabufHeapName: string }) => number;
  findDefaultPhysicallyContiguousHeap: () => number;
};

const createDmabufHeapFinder = ({ dmabufHeapDeviceFolder }: { dmabufHeapDeviceFolder: string }) => {

};

const createDefaultDmabufHeapFinder = () => {
  return createDmabufHeapFinder({ dmabufHeapDeviceFolder: "/dev/dma_heap" });
};

export {
  createDmabufHeapFinder
};
