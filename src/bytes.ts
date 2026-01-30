export type Bytes = Uint8Array;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const concat = (chunks: Bytes[]): Bytes => {
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }

  return out;
};

export const equal = (a: Bytes, b: Bytes): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

export const utf8ToBytes = (value: string): Bytes => encoder.encode(value);
export const bytesToUtf8 = (value: Bytes): string => decoder.decode(value);

export const fromHex = (value: string): Bytes => {
  const normalized = value.length % 2 === 0 ? value : `0${value}`;
  const length = normalized.length / 2;
  const out = new Uint8Array(length);

  for (let i = 0; i < length; i++) {
    const byte = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error("Invalid hex string");
    }
    out[i] = byte;
  }

  return out;
};

export const toHex = (value: Bytes): string => {
  let result = "";
  for (const byte of value) {
    result += byte.toString(16).padStart(2, "0");
  }
  return result;
};
