import { OpCode } from "../bitcoin/op-codes";
import { Bytes } from "../bytes";

export const OP_INT_BASE = OpCode.OP_RESERVED;

export const asMinimalOP = (buffer: Bytes) => {
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

export const slice = (buffer: Bytes, offset: number, length: number) =>
  buffer.slice(offset, length);

export const reverseBytes = (buffer: Bytes) => {
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

export const cloneBytes = (
  source: Bytes,
  targetStart: number = 0,
  sourceStart?: number | undefined,
  sourceEnd?: number | undefined,
) => {
  sourceStart = sourceStart ?? 0;
  sourceEnd = sourceEnd ?? source.length;

  const clone = new Uint8Array(sourceEnd - sourceStart);
  clone.set(source.subarray(sourceStart, sourceEnd), targetStart);

  return clone;
};

const indexOfSubarray = (source: Bytes, needle: Bytes, fromIndex = 0) => {
  if (needle.length === 0) return fromIndex;
  for (let i = fromIndex; i <= source.length - needle.length; i++) {
    let match = true;
    for (let j = 0; j < needle.length; j++) {
      if (source[i + j] !== needle[j]) {
        match = false;
        break;
      }
    }
    if (match) return i;
  }
  return -1;
};

export const splitBytes = (source: Bytes, splitBy: Bytes): Bytes[] => {
  let search = -1;
  const move = 0;
  const segments: Bytes[] = [];

  while ((search = indexOfSubarray(source, splitBy)) > -1) {
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

const asSafeInteger = (value: number): number => {
  if (!Number.isInteger(value)) {
    throw new Error(`value has a fractional component: ${value}`);
  }

  if (!Number.isSafeInteger(value)) {
    throw new Error(
      `value exceeds Number.MAX_SAFE_INTEGER bounds: ${value}`,
    );
  }

  return value;
};

export const getMinimumRequiredByte = (value: number): number => {
  const safeValue = asSafeInteger(value);
  const big = BigInt(safeValue);

  for (let bytes = 1; bytes <= 8; bytes++) {
    const bits = BigInt(bytes * 8 - 1);
    const min = -(BigInt(1) << bits);
    const max = (BigInt(1) << bits) - BigInt(1);

    if (big >= min && big <= max) {
      return bytes;
    }
  }

  return 8;
};

export const getNumberBytes = (value: number): Bytes => {
  const safeValue = asSafeInteger(value);
  const size = getMinimumRequiredByte(safeValue);
  const buffer = new Uint8Array(size);
  const sizeBits = BigInt(size * 8);
  let big = BigInt(safeValue);

  if (safeValue < 0) {
    big = (BigInt(1) << sizeBits) + big;
  }

  for (let i = 0; i < size; i++) {
    buffer[i] = Number(big & BigInt(0xff));
    big >>= BigInt(8);
  }

  return buffer;
};

export const estimateChunkSize = (bufferSize: number) =>
  getVarIntLength(bufferSize) + bufferSize;

export const getChunkSize = (buffer: Bytes) => estimateChunkSize(buffer.length);
