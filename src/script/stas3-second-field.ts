import { Bytes } from "../bytes";

export const enum DstasActionKind {
  swap = 0x01,
  confiscation = 0x02,
  freeze = 0x03,
}

export type DstasSwapActionData = {
  kind: "swap";
  requestedScriptHash: Bytes;
  requestedPkh: Bytes;
  rateNumerator: number;
  rateDenominator: number;
  next?: DstasSwapActionData;
};

export type DstasActionData = {
  kind: "action";
  action: DstasActionKind.confiscation | DstasActionKind.freeze;
  payload?: Bytes;
};

export type ParsedActionData =
  | { kind: "empty" }
  | DstasSwapActionData
  | DstasActionData
  | { kind: "unknown"; action: number; payload: Bytes };

const ensureLength = (value: Bytes, expected: number, name: string) => {
  if (value.length !== expected) {
    throw new Error(`${name} must be ${expected} bytes, got ${value.length}`);
  }
};

const ensureU32 = (value: number, name: string) => {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`${name} must be uint32, got ${value}`);
  }
};

const writeU32Le = (value: number, out: Uint8Array, offset: number) => {
  out[offset] = value & 0xff;
  out[offset + 1] = (value >>> 8) & 0xff;
  out[offset + 2] = (value >>> 16) & 0xff;
  out[offset + 3] = (value >>> 24) & 0xff;
};

const readU32Le = (bytes: Bytes, offset: number): number =>
  (bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)) >>>
  0;

const SWAP_LEG_SIZE = 1 + 32 + 20 + 8;

const encodeSwapCore = (spec: DstasSwapActionData): Bytes => {
  const legs: DstasSwapActionData[] = [];
  const seen = new Set<DstasSwapActionData>();
  let current: DstasSwapActionData | undefined = spec;
  while (current) {
    if (seen.has(current)) {
      throw new Error("swap second field has cyclic next reference");
    }
    seen.add(current);

    ensureLength(current.requestedScriptHash, 32, "requestedScriptHash");
    ensureLength(current.requestedPkh, 20, "requestedPkh");
    ensureU32(current.rateNumerator, "rateNumerator");
    ensureU32(current.rateDenominator, "rateDenominator");

    legs.push(current);
    current = current.next;
  }

  const out = new Uint8Array(legs.length * SWAP_LEG_SIZE);
  let offset = 0;

  for (const leg of legs) {
    out[offset++] = DstasActionKind.swap;
    out.set(leg.requestedScriptHash, offset);
    offset += 32;
    out.set(leg.requestedPkh, offset);
    offset += 20;
    writeU32Le(leg.rateNumerator, out, offset);
    offset += 4;
    writeU32Le(leg.rateDenominator, out, offset);
    offset += 4;
  }

  return out;
};

const decodeSwapCore = (
  bytes: Bytes,
  offset: number,
): { parsed: DstasSwapActionData; nextOffset: number } => {
  let nextOffset = offset;
  let first: DstasSwapActionData | undefined;
  let tail: DstasSwapActionData | undefined;

  while (nextOffset < bytes.length) {
    if (nextOffset + SWAP_LEG_SIZE > bytes.length) {
      throw new Error("swap second field is truncated");
    }
    if (bytes[nextOffset] !== DstasActionKind.swap) {
      throw new Error("swap second field must start with action=0x01");
    }

    const parsed: DstasSwapActionData = {
      kind: "swap",
      requestedScriptHash: bytes.subarray(nextOffset + 1, nextOffset + 33),
      requestedPkh: bytes.subarray(nextOffset + 33, nextOffset + 53),
      rateNumerator: readU32Le(bytes, nextOffset + 53),
      rateDenominator: readU32Le(bytes, nextOffset + 57),
    };

    if (!first) {
      first = parsed;
      tail = parsed;
    } else {
      tail!.next = parsed;
      tail = parsed;
    }

    nextOffset += SWAP_LEG_SIZE;
  }

  if (!first) {
    throw new Error("swap second field is truncated");
  }

  return { parsed: first, nextOffset };
};

export const encodeActionData = (
  value: DstasSwapActionData | DstasActionData,
): Bytes => {
  if (value.kind === "swap") return encodeSwapCore(value);

  const payload = value.payload ?? new Uint8Array(0);
  const out = new Uint8Array(1 + payload.length);
  out[0] = value.action;
  out.set(payload, 1);
  return out;
};

export const decodeActionData = (bytes: Bytes): ParsedActionData => {
  if (bytes.length === 0) return { kind: "empty" };

  const action = bytes[0];
  if (action === DstasActionKind.swap) {
    const decoded = decodeSwapCore(bytes, 0);
    if (decoded.nextOffset !== bytes.length) {
      throw new Error("swap second field has trailing bytes");
    }
    return decoded.parsed;
  }

  if (
    action === DstasActionKind.confiscation ||
    action === DstasActionKind.freeze
  ) {
    return {
      kind: "action",
      action,
      payload: bytes.subarray(1),
    };
  }

  return {
    kind: "unknown",
    action,
    payload: bytes.subarray(1),
  };
};

export const buildSwapActionData = (
  value: Omit<DstasSwapActionData, "kind">,
): Bytes =>
  encodeActionData({
    kind: "swap",
    ...value,
  });
