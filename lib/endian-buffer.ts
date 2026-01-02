import nodeOs from "node:os";

type TEndianness = "LE" | "BE";

const endianBufferViewFor = ({ buffer, endianness }: { buffer: Uint8Array, endianness: TEndianness }) => {
  const dataView = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  const isLittleEndian = endianness === "LE";

  const readU16 = ({ offset }: { offset: number }) => {
    return dataView.getUint16(offset, isLittleEndian);
  };

  const readU32 = ({ offset }: { offset: number }) => {
    return dataView.getUint32(offset, isLittleEndian);
  };

  const readU64 = ({ offset }: { offset: number }) => {
    return dataView.getBigUint64(offset, isLittleEndian);
  };

  const writeU16 = ({ offset, value }: { offset: number, value: number }) => {
    dataView.setUint16(offset, value, isLittleEndian);
  };

  const writeU32 = ({ offset, value }: { offset: number, value: number }) => {
    dataView.setUint32(offset, value, isLittleEndian);
  };

  const writeU64 = ({ offset, value }: { offset: number, value: bigint }) => {
    dataView.setBigUint64(offset, value, isLittleEndian);
  };

  return {
    readU16,
    readU32,
    readU64,
    writeU16,
    writeU32,
    writeU64
  };
};

const determineSystemEndianness = (): TEndianness => {
  return nodeOs.endianness();
};

const hostEndianBufferViewFor = ({ buffer }: { buffer: Uint8Array }) => {
  return endianBufferViewFor({ buffer, endianness: determineSystemEndianness() });
};

export {
  endianBufferViewFor,
  hostEndianBufferViewFor
};

export type {
  TEndianness
};
