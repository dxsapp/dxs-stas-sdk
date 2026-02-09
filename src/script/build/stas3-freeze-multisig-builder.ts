import { Bytes } from "../../bytes";
import { getNumberBytes } from "../../buffer/buffer-utils";
import { OpCode } from "../../bitcoin/op-codes";
import { ScriptType } from "../../bitcoin/script-type";
import { ScriptBuilder } from "./script-builder";
import { ScriptToken } from "../script-token";
import { buildStas3BaseTokens } from "../templates/stas3-freeze-multisig-base";

export type SecondFieldInput = Bytes | number | null;
export type Stas3FlagsInput = {
  freezable?: boolean;
};

export type Stas3FreezeMultisigParams = {
  owner?: Bytes;
  ownerPkh?: Bytes;
  secondField: SecondFieldInput;
  redemptionPkh: Bytes;
  frozen?: boolean;
  flags?: Bytes | Stas3FlagsInput | null;
  serviceFields?: Bytes[];
  optionalData?: Bytes[];
};

export const buildStas3Flags = (flags?: Stas3FlagsInput): Bytes => {
  const result = new Uint8Array(1);
  if (flags?.freezable) result[0] |= 0x01;
  return result;
};

const ensureLength = (value: Bytes, expected: number, name: string) => {
  if (value.length !== expected) {
    throw new Error(`${name} must be ${expected} bytes, got ${value.length}`);
  }
};

const resolveOwner = (params: Stas3FreezeMultisigParams): Bytes => {
  const owner = params.owner ?? params.ownerPkh;
  if (!owner || owner.length === 0) {
    throw new Error("owner must be provided");
  }
  return owner;
};

const buildOwnerToken = (value: Bytes) => ScriptToken.fromBytes(value);

const buildSecondFieldToken = (
  field: SecondFieldInput,
  frozen: boolean,
): ScriptToken => {
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
  flags?: Bytes | Stas3FlagsInput | null,
): ScriptToken => {
  const fallback = new Uint8Array([0x00]);
  const encoded =
    flags instanceof Uint8Array
      ? flags.length === 0
        ? fallback
        : flags
      : flags
        ? buildStas3Flags(flags)
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

export const buildStas3FreezeMultisigTokens = (
  params: Stas3FreezeMultisigParams,
): ScriptToken[] => {
  const frozen = params.frozen === true;

  ensureLength(params.redemptionPkh, 20, "redemptionPkh");

  const ownerToken = buildOwnerToken(resolveOwner(params));
  const secondToken = buildSecondFieldToken(params.secondField, frozen);
  const redemptionToken = ScriptToken.fromBytes(params.redemptionPkh);
  const flagsToken = buildFlagsToken(params.flags);
  const serviceTokens = buildDataTokens(params.serviceFields);
  const optionalTokens = buildDataTokens(params.optionalData);

  if (
    !params.flags &&
    params.serviceFields &&
    params.serviceFields.length > 0
  ) {
    throw new Error("serviceFields require flags to be provided");
  }

  const baseTokens = buildStas3BaseTokens();
  const tokens: ScriptToken[] = [ownerToken, secondToken, ...baseTokens];

  tokens.push(redemptionToken, flagsToken, ...serviceTokens, ...optionalTokens);

  return tokens;
};

export const buildStas3FreezeMultisigScript = (
  params: Stas3FreezeMultisigParams,
): Bytes => {
  const tokens = buildStas3FreezeMultisigTokens(params);
  return ScriptBuilder.fromTokens(tokens, ScriptType.unknown).toBytes();
};

export const buildStas3FreezeMultisigAsm = (
  params: Stas3FreezeMultisigParams,
): string => {
  const tokens = buildStas3FreezeMultisigTokens(params);
  return ScriptBuilder.fromTokens(tokens, ScriptType.unknown).toAsm();
};
