import { OpCode } from "../../bitcoin/op-codes";
import { Bytes, toHex } from "../../bytes";

type RawChunk = {
  opcode: number;
  start: number;
  end: number;
  data?: Bytes;
};

export type Stas3UnlockingScriptDecomposition = {
  parsed: boolean;
  errors: string[];
  firstOutputSatoshis?: number;
  firstOutputReceiverPkhHex?: string;
  noteHexes: string[];
  hasExplicitEmptyNote: boolean;
  authPlaceholderOpcodes: number[];
  fundingVout?: number;
  fundingTxIdLeHex?: string;
  mergeMode: "none" | "present" | "unknown";
  preimageHex?: string;
  spendingType?: number;
  signatureHex?: string;
  publicKeyHex?: string;
};

const readRawChunk = (script: Bytes, offset: number): RawChunk | undefined => {
  if (offset >= script.length) return undefined;
  const opcode = script[offset];

  if (opcode > OpCode.OP_0 && opcode < OpCode.OP_PUSHDATA1) {
    const size = opcode;
    const start = offset + 1;
    const end = start + size;
    if (end > script.length) return undefined;
    return { opcode, start: offset, end, data: script.subarray(start, end) };
  }

  if (opcode === OpCode.OP_PUSHDATA1) {
    if (offset + 2 > script.length) return undefined;
    const size = script[offset + 1];
    const start = offset + 2;
    const end = start + size;
    if (end > script.length) return undefined;
    return { opcode, start: offset, end, data: script.subarray(start, end) };
  }

  if (opcode === OpCode.OP_PUSHDATA2) {
    if (offset + 3 > script.length) return undefined;
    const size = script[offset + 1] | (script[offset + 2] << 8);
    const start = offset + 3;
    const end = start + size;
    if (end > script.length) return undefined;
    return { opcode, start: offset, end, data: script.subarray(start, end) };
  }

  if (opcode === OpCode.OP_PUSHDATA4) {
    if (offset + 5 > script.length) return undefined;
    const size =
      (script[offset + 1] |
        (script[offset + 2] << 8) |
        (script[offset + 3] << 16) |
        (script[offset + 4] << 24)) >>>
      0;
    const start = offset + 5;
    const end = start + size;
    if (end > script.length) return undefined;
    return { opcode, start: offset, end, data: script.subarray(start, end) };
  }

  return { opcode, start: offset, end: offset + 1 };
};

const parseScriptNum = (value: Bytes): number | undefined => {
  if (value.length === 0) return 0;
  if (value.length > 4) return undefined;

  let result = 0;
  for (let i = 0; i < value.length; i++) {
    result |= value[i] << (8 * i);
  }

  const last = value[value.length - 1];
  const negative = (last & 0x80) !== 0;
  if (negative) {
    result &= ~(0x80 << (8 * (value.length - 1)));
    result = -result;
  }

  return result;
};

const parseNumberChunk = (chunk: RawChunk): number | undefined => {
  if (chunk.data) return parseScriptNum(chunk.data);
  if (chunk.opcode === OpCode.OP_0) return 0;
  if (chunk.opcode === OpCode.OP_1NEGATE) return -1;
  if (chunk.opcode >= OpCode.OP_1 && chunk.opcode <= OpCode.OP_16) {
    return chunk.opcode - OpCode.OP_1 + 1;
  }
  return undefined;
};

export const decomposeStas3UnlockingScript = (
  script: Bytes,
): Stas3UnlockingScriptDecomposition => {
  const result: Stas3UnlockingScriptDecomposition = {
    parsed: false,
    errors: [],
    noteHexes: [],
    hasExplicitEmptyNote: false,
    authPlaceholderOpcodes: [],
    mergeMode: "unknown",
  };

  const chunks: RawChunk[] = [];
  let cursor = 0;
  while (cursor < script.length) {
    const chunk = readRawChunk(script, cursor);
    if (!chunk) {
      result.errors.push("failed to decode chunk");
      return result;
    }
    chunks.push(chunk);
    cursor = chunk.end;
  }

  if (chunks.length < 9) {
    result.errors.push("too few chunks for STAS3 unlocking layout");
    return result;
  }

  const pubChunk = chunks[chunks.length - 1];
  const sigChunk = chunks[chunks.length - 2];
  const spendingTypeChunk = chunks[chunks.length - 3];
  const preimageChunk = chunks[chunks.length - 4];
  const mergeMarkerChunk = chunks[chunks.length - 5];
  const fundingTxIdChunk = chunks[chunks.length - 6];
  const fundingVoutChunk = chunks[chunks.length - 7];

  if (!pubChunk.data || pubChunk.data.length !== 33) {
    result.errors.push("public key chunk not found at script end");
  } else {
    result.publicKeyHex = toHex(pubChunk.data);
  }

  if (!sigChunk.data || sigChunk.data.length < 9) {
    result.errors.push("signature chunk not found");
  } else {
    result.signatureHex = toHex(sigChunk.data);
  }

  if (!preimageChunk.data || preimageChunk.data.length < 120) {
    result.errors.push("preimage chunk not found");
  } else {
    result.preimageHex = toHex(preimageChunk.data);
  }

  const spendingType = parseNumberChunk(spendingTypeChunk);
  if (spendingType === undefined) {
    result.errors.push("spending type chunk is not a script number");
  } else {
    result.spendingType = spendingType;
  }

  if (!fundingTxIdChunk.data || fundingTxIdChunk.data.length !== 32) {
    result.errors.push("funding txid(LE) chunk not found");
  } else {
    result.fundingTxIdLeHex = toHex(fundingTxIdChunk.data);
  }

  const fundingVout = parseNumberChunk(fundingVoutChunk);
  if (fundingVout === undefined) {
    result.errors.push("funding vout chunk is not a script number");
  } else {
    result.fundingVout = fundingVout;
  }

  if (mergeMarkerChunk.opcode === OpCode.OP_0 && !mergeMarkerChunk.data) {
    result.mergeMode = "none";
  } else {
    result.mergeMode = "present";
  }

  const head = chunks.slice(0, chunks.length - 7);
  if (head.length < 3) {
    result.errors.push("missing first token-output chunks");
    return result;
  }

  const satChunk = head[0];
  const pkhChunk = head[1];

  const sat = parseNumberChunk(satChunk);
  if (sat === undefined) {
    result.errors.push("first output satoshis is not a script number");
  } else {
    result.firstOutputSatoshis = sat;
  }

  if (!pkhChunk.data || pkhChunk.data.length !== 20) {
    result.errors.push("first output receiver pkh(20) not found");
  } else {
    result.firstOutputReceiverPkhHex = toHex(pkhChunk.data);
  }

  let noteStartIdx = 3;
  const tailHead = head.slice(3);
  const auth1 = tailHead[0];
  const auth2 = tailHead[1];
  const auth3 = tailHead[2];
  result.authPlaceholderOpcodes = [
    auth1?.opcode ?? -1,
    auth2?.opcode ?? -1,
    auth3?.opcode ?? -1,
  ];

  // with-change: [changeSatoshis(scriptnum), changePkh(20), notes...]
  const hasChangePair =
    !!auth1 &&
    !!auth2 &&
    parseNumberChunk(auth1) !== undefined &&
    !!auth2.data &&
    auth2.data.length === 20;

  // no-change: [OP_0, OP_0, notes...]
  const hasNoChangePlaceholders =
    !!auth1 &&
    !!auth2 &&
    auth1.opcode === OpCode.OP_0 &&
    !auth1.data &&
    auth2.opcode === OpCode.OP_0 &&
    !auth2.data;

  if (hasChangePair) {
    noteStartIdx = 5;
  } else if (hasNoChangePlaceholders) {
    noteStartIdx = 5;
  } else if (tailHead.length > 0) {
    result.errors.push("unexpected post-output layout before funding fields");
  }

  for (let i = noteStartIdx; i < head.length; i++) {
    const chunk = head[i];
    if (chunk.opcode === OpCode.OP_0 && !chunk.data) {
      result.hasExplicitEmptyNote = true;
    } else if (chunk.data) {
      result.noteHexes.push(toHex(chunk.data));
    } else {
      result.errors.push(`unexpected opcode in note area: ${chunk.opcode}`);
    }
  }

  result.parsed = result.errors.length === 0;
  return result;
};
