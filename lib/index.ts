
import { dmabufTransaction } from "./dmabuf-transaction.ts";
import { createHandleImporter } from "./dmabuf-handle.ts";
import type { TDmabufHandle, TImportAndDupDmabufFunc } from "./dmabuf-handle.ts";
import type { TDmabufMapping } from "./dmabuf-mapping.ts";
import { createLinuxHostInterface } from "./linux-interface-impl.ts";

const linuxInterface = createLinuxHostInterface();

const handleImporter = createHandleImporter({
  linuxInterface
});

const importAndDupDmabuf = handleImporter.importAndDupDmabuf as TImportAndDupDmabufFunc;

export {
  dmabufTransaction,
  importAndDupDmabuf
};

export type {
  TDmabufHandle,
  TDmabufMapping,
};
