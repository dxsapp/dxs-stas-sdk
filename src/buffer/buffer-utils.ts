import toBufferExternal from "typedarray-to-buffer";
import { OpCode } from "../bitcoin/op-codes";

export const OP_INT_BASE = OpCode.OP_RESERVED;

export const asMinimalOP = (buffer: Buffer) => {
  if (buffer.length === 0) return OpCode.OP_0;
  if (buffer.length !== 1) return;
  if (buffer[0] >= 1 && buffer[0] <= 16) return OP_INT_BASE + buffer[0];
  if (buffer[0] === 0x81) return OpCode.OP_1NEGATE;
};

export const ensureUInt = (value: number, max: number) => {
  if (value < 0)
    throw new Error("specified a negative value for writing an unsigned value");

  if (value > max) throw new Error("RangeError: value out of range");

  if (Math.floor(value) !== value)
    throw new Error(`value has a fractional component: ${value}`);
};

export const toBuffer = toBufferExternal;

export const toUtf8Buffer = (value: string) => Buffer.from(value, "utf8");
export const toHexBuffer = (value: string) => Buffer.from(value, "hex");

export const slice = (buffer: Buffer, offset: number, length: number) =>
  toBuffer(Uint8Array.prototype.slice.call(buffer, offset, length));

export const reverseBuffer = (buffer: Buffer) => {
  let j = buffer.length - 1;
  let tmp = 0;

  for (let i = 0; i < buffer.length / 2; i++) {
    tmp = buffer[i];
    buffer[i] = buffer[j];
    buffer[j] = tmp;
    j--;
  }

  return buffer;
};

export const cloneBuffer = (
  source: Buffer,
  targetStart: number = 0,
  sourceStart?: number | undefined,
  sourceEnd?: number | undefined
) => {
  sourceStart = sourceStart ?? 0;
  sourceEnd = sourceEnd ?? source.length;

  const clone = Buffer.allocUnsafe(sourceEnd - sourceStart);
  source.copy(clone, targetStart, sourceStart, sourceEnd);

  return clone;
};

export const splitBuffer = (source: Buffer, splitBy: Buffer): Buffer[] => {
  let search = -1;
  let move = 0;
  const segments: Buffer[] = [];

  while ((search = source.indexOf(splitBy)) > -1) {
    const segment = slice(source, 0, search + move);
    if (segment.length > 0) segments.push(segment);

    source = slice(source, search + splitBy.length, source.length);
  }

  if (source.length > 0) segments.push(source);

  return segments;
};

export const getVarIntLength = (value: number): number =>
  value < 0xfd ? 1 : value <= 0xffff ? 3 : value <= 0xffffffff ? 5 : 9;

export const getNumberSize = (data: number): number =>
  data > 0 && data <= 16
    ? 1
    : getVarIntLength(getMinimumRequiredByte(data)) +
      getMinimumRequiredByte(data);

export const getMinimumRequiredByte = (value: number): number =>
  value >= -128 && value <= 127
    ? 1
    : value >= -32768 && value <= 32767
    ? 2
    : value >= -8388608 && value <= 8388607
    ? 3
    : value >= -2147483648 && value <= 2147483647
    ? 4
    : value >= -549755813888 && value <= 549755813887
    ? 5
    : value >= -140737488355328 && value <= 140737488355327
    ? 6
    : value >= -36028797018963968 && value <= 36028797018963967 // TODO it's a bug  MAX_SAFE_INTEGER = 9007199254740991
    ? 7
    : 8;

export const getNumberBuffer = (value: number): Buffer => {
  const size = getMinimumRequiredByte(value);
  const buffer = Buffer.alloc(size);

  buffer.writeIntLE(value, 0, size);

  return buffer;
};

export const estimateChunkSize = (bufferSize: number) =>
  getVarIntLength(bufferSize) + bufferSize;

export const getChunkSize = (buffer: Buffer) =>
  estimateChunkSize(buffer.length);
