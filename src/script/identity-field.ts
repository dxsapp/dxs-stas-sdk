import { Point } from "@noble/secp256k1";
import { Bytes, equal, toHex } from "../bytes";

const isCompressedPubKey = (key: Bytes): boolean =>
  key.length === 33 && (key[0] === 0x02 || key[0] === 0x03);

export const isCanonicalMpkhField = (value: Bytes): boolean => {
  if (value.length < 36) return false;

  const m = value[0];
  const n = value[value.length - 1];

  if (n <= 0 || n > 5) return false;
  if (m <= 0 || m > n) return false;
  if (value.length !== 1 + n * 34 + 1) return false;

  const seen = new Set<string>();
  let offset = 1;

  for (let i = 0; i < n; i++) {
    if (value[offset] !== 0x21) return false;
    const key = value.subarray(offset + 1, offset + 34);
    if (!isCompressedPubKey(key)) return false;

    try {
      Point.fromHex(toHex(key));
    } catch {
      return false;
    }

    const keyHex = toHex(key);
    if (seen.has(keyHex)) return false;
    seen.add(keyHex);
    offset += 34;
  }

  return offset === value.length - 1;
};

export const isSupportedIdentityField = (value: Bytes): boolean =>
  value.length === 20 || isCanonicalMpkhField(value);

export const assertSupportedIdentityField = (
  value: Bytes,
  name: string,
): void => {
  if (value.length === 20) return;
  if (isCanonicalMpkhField(value)) return;
  throw new Error(
    `${name} must be either 20-byte PKH or canonical MPKH preimage`,
  );
};

export const sameBytesOrShape = (
  expected: { OpCodeNum: number; DataLength: number; Data?: Bytes },
  actual: { OpCodeNum: number; Data: Bytes },
): boolean => {
  if (expected.OpCodeNum !== actual.OpCodeNum) return false;
  if (expected.Data !== undefined) return equal(expected.Data, actual.Data);
  return expected.DataLength === actual.Data.length;
};
