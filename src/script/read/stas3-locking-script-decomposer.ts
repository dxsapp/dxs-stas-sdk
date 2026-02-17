import { OpCode } from "../../bitcoin/op-codes";
import { ScriptType } from "../../bitcoin/script-type";
import { Bytes, equal, toHex } from "../../bytes";
import { ScriptBuilder } from "../build/script-builder";
import { buildStas3BaseTokens } from "../templates/stas3-freeze-multisig-base";

type RawChunk = {
  opcode: number;
  start: number;
  end: number;
  data?: Bytes;
};

export type DstasActionDataField =
  | { kind: "opcode"; opcode: number }
  | { kind: "data"; hex: string };

export type Stas3LockingScriptDecomposition = {
  ownerHex?: string;
  ownerPkhHex?: string;
  actionData?: DstasActionDataField;
  baseMatched: boolean;
  redemptionPkhHex?: string;
  flagsHex?: string;
  freezeEnabled?: boolean;
  confiscationEnabled?: boolean;
  serviceFieldHexes: string[];
  optionalDataHexes: string[];
  trailingOpcodes: number[];
  errors: string[];
};

const STAS3_BASE_SCRIPT = ScriptBuilder.fromTokens(
  buildStas3BaseTokens(),
  ScriptType.unknown,
).toBytes();

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

export const decomposeStas3LockingScript = (
  script: Bytes,
): Stas3LockingScriptDecomposition => {
  const result: Stas3LockingScriptDecomposition = {
    baseMatched: false,
    serviceFieldHexes: [],
    optionalDataHexes: [],
    trailingOpcodes: [],
    errors: [],
  };

  const owner = readRawChunk(script, 0);
  if (!owner || !owner.data || owner.data.length === 0) {
    result.errors.push("owner field pushdata was not found at script start");
    return result;
  }
  result.ownerHex = toHex(owner.data);
  if (owner.data.length === 20) {
    result.ownerPkhHex = result.ownerHex;
  }

  const second = readRawChunk(script, owner.end);
  if (!second) {
    result.errors.push("action data was not found");
    return result;
  }

  result.actionData = second.data
    ? { kind: "data", hex: toHex(second.data) }
    : { kind: "opcode", opcode: second.opcode };

  const baseStart = second.end;
  const baseEnd = baseStart + STAS3_BASE_SCRIPT.length;
  if (baseEnd > script.length) {
    result.errors.push("script is shorter than STAS3 base template");
    return result;
  }

  result.baseMatched = equal(
    script.subarray(baseStart, baseEnd),
    STAS3_BASE_SCRIPT,
  );
  if (!result.baseMatched) {
    result.errors.push(
      "script middle does not match STAS3 base template bytes",
    );
    return result;
  }

  const redemption = readRawChunk(script, baseEnd);
  if (!redemption || !redemption.data || redemption.data.length !== 20) {
    result.errors.push("redemption PKH pushdata(20) was not found");
    return result;
  }
  result.redemptionPkhHex = toHex(redemption.data);

  let cursor = redemption.end;
  const flags = readRawChunk(script, cursor);
  if (!flags) return result;

  if (flags.data) {
    result.flagsHex = toHex(flags.data);
    const rightmostByte =
      flags.data.length > 0 ? flags.data[flags.data.length - 1] : 0;
    result.freezeEnabled = (rightmostByte & 0x01) === 0x01;
    result.confiscationEnabled = (rightmostByte & 0x02) === 0x02;
  } else if (flags.opcode === OpCode.OP_0) {
    result.flagsHex = "";
    result.freezeEnabled = false;
    result.confiscationEnabled = false;
  } else {
    result.errors.push("flags field is not pushdata/OP_0");
    result.trailingOpcodes.push(flags.opcode);
  }

  cursor = flags.end;
  const expectedServiceFieldsCount =
    (result.freezeEnabled ? 1 : 0) + (result.confiscationEnabled ? 1 : 0);
  while (cursor < script.length) {
    const chunk = readRawChunk(script, cursor);
    if (!chunk) {
      result.errors.push("failed to parse tail chunk");
      break;
    }
    if (chunk.data) {
      if (result.serviceFieldHexes.length < expectedServiceFieldsCount) {
        result.serviceFieldHexes.push(toHex(chunk.data));
      } else {
        result.optionalDataHexes.push(toHex(chunk.data));
      }
    } else {
      result.trailingOpcodes.push(chunk.opcode);
    }
    cursor = chunk.end;
  }

  return result;
};
