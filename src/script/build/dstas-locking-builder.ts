import { Bytes } from "../../bytes";
import { getNumberBytes } from "../../buffer/buffer-utils";
import { OpCode } from "../../bitcoin/op-codes";
import { ScriptType } from "../../bitcoin/script-type";
import { ScriptBuilder } from "./script-builder";
import { ScriptToken } from "../script-token";
import { buildDstasTemplateBaseTokens } from "../templates/dstas-locking-template-base";
import {
  DstasActionData,
  DstasSwapActionData,
  encodeActionData,
} from "../dstas-action-data";

export type ActionDataInput =
  | Bytes
  | number
  | null
  | DstasSwapActionData
  | DstasActionData;
export type DstasFlagsInput = {
  freezable?: boolean;
  confiscatable?: boolean;
};

export type DstasLockingParams = {
  owner?: Bytes;
  ownerPkh?: Bytes;
  actionData: ActionDataInput;
  redemptionPkh: Bytes;
  frozen?: boolean;
  flags?: Bytes | DstasFlagsInput | null;
  serviceFields?: Bytes[];
  optionalData?: Bytes[];
};

export const buildDstasFlags = (flags?: DstasFlagsInput): Bytes => {
  const result = new Uint8Array(1);
  if (flags?.freezable) result[0] |= 0x01;
  if (flags?.confiscatable) result[0] |= 0x02;
  return result;
};

const parseProtocolFlags = (
  flags: Bytes,
): {
  freezable: boolean;
  confiscatable: boolean;
} => {
  const rightmostByte = flags.length > 0 ? flags[flags.length - 1] : 0;
  return {
    freezable: (rightmostByte & 0x01) === 0x01,
    confiscatable: (rightmostByte & 0x02) === 0x02,
  };
};

const ensureLength = (value: Bytes, expected: number, name: string) => {
  if (value.length !== expected) {
    throw new Error(`${name} must be ${expected} bytes, got ${value.length}`);
  }
};

const resolveOwner = (params: DstasLockingParams): Bytes => {
  const owner = params.owner ?? params.ownerPkh;
  if (!owner || owner.length === 0) {
    throw new Error("owner must be provided");
  }
  return owner;
};

const buildOwnerToken = (value: Bytes) => ScriptToken.fromBytes(value);

const buildActionDataToken = (
  field: ActionDataInput,
  frozen: boolean,
): ScriptToken => {
  if (typeof field === "object" && field && "kind" in field) {
    return ScriptToken.fromBytes(encodeActionData(field));
  }

  if (field === null) {
    return new ScriptToken(
      frozen ? OpCode.OP_2 : OpCode.OP_0,
      frozen ? OpCode.OP_2 : OpCode.OP_0,
    );
  }

  if (typeof field !== "number" && field.length === 0) {
    return new ScriptToken(
      frozen ? OpCode.OP_2 : OpCode.OP_0,
      frozen ? OpCode.OP_2 : OpCode.OP_0,
    );
  }

  const raw =
    typeof field === "number" ? getNumberBytes(field) : new Uint8Array(field);

  if (!frozen) return ScriptToken.fromBytes(raw);

  const prefixed = new Uint8Array(raw.length + 1);
  prefixed[0] = 0x02;
  prefixed.set(raw, 1);

  return ScriptToken.fromBytes(prefixed);
};

const buildFlagsToken = (
  flags?: Bytes | DstasFlagsInput | null,
): ScriptToken => {
  const fallback = new Uint8Array([0x00]);
  const encoded =
    flags instanceof Uint8Array
      ? flags.length === 0
        ? fallback
        : flags
      : flags
        ? buildDstasFlags(flags)
        : fallback;

  if (encoded.length > 75) {
    throw new Error(`flags length must be <= 75 bytes, got ${encoded.length}`);
  }

  return ScriptToken.fromBytes(encoded);
};

const buildDataTokens = (values?: Bytes[]): ScriptToken[] => {
  if (!values || values.length === 0) return [];
  return values.map((v) => ScriptToken.fromBytes(v));
};

export const buildDstasLockingTokens = (
  params: DstasLockingParams,
): ScriptToken[] => {
  const frozen = params.frozen === true;

  ensureLength(params.redemptionPkh, 20, "redemptionPkh");

  const ownerToken = buildOwnerToken(resolveOwner(params));
  const actionDataToken = buildActionDataToken(params.actionData, frozen);
  const redemptionToken = ScriptToken.fromBytes(params.redemptionPkh);
  const flagsToken = buildFlagsToken(params.flags);
  const serviceTokens = buildDataTokens(params.serviceFields);
  const optionalTokens = buildDataTokens(params.optionalData);
  const parsedFlags = parseProtocolFlags(flagsToken.Data ?? new Uint8Array(0));
  const expectedServiceFieldsCount =
    (parsedFlags.freezable ? 1 : 0) + (parsedFlags.confiscatable ? 1 : 0);
  if (serviceTokens.length !== expectedServiceFieldsCount) {
    throw new Error(
      `serviceFields count ${serviceTokens.length} does not match flags requirements ${expectedServiceFieldsCount}`,
    );
  }

  const baseTokens = buildDstasTemplateBaseTokens();
  const tokens: ScriptToken[] = [ownerToken, actionDataToken, ...baseTokens];

  tokens.push(redemptionToken, flagsToken, ...serviceTokens, ...optionalTokens);

  return tokens;
};

export const buildDstasLockingScript = (params: DstasLockingParams): Bytes => {
  const tokens = buildDstasLockingTokens(params);
  return ScriptBuilder.fromTokens(tokens, ScriptType.unknown).toBytes();
};

export const buildDstasLockingAsm = (params: DstasLockingParams): string => {
  const tokens = buildDstasLockingTokens(params);
  return ScriptBuilder.fromTokens(tokens, ScriptType.unknown).toAsm();
};
