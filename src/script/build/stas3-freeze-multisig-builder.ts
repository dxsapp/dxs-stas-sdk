import { Bytes } from "../../bytes";
import { getNumberBytes } from "../../buffer/buffer-utils";
import { OpCode } from "../../bitcoin/op-codes";
import { ScriptType } from "../../bitcoin/script-type";
import { ScriptBuilder } from "./script-builder";
import { ScriptToken } from "../script-token";
import { buildStas3BaseTokens } from "../templates/stas3-freeze-multisig-base";

export type SecondFieldInput = Bytes | number | null;

export type Stas3FreezeMultisigParams = {
  ownerPkh: Bytes;
  secondField: SecondFieldInput;
  redemptionPkh: Bytes;
  frozen?: boolean;
  flags?: Bytes | null;
  serviceFields?: Bytes[];
  optionalData?: Bytes[];
};

const ensureLength = (value: Bytes, expected: number, name: string) => {
  if (value.length !== expected) {
    throw new Error(`${name} must be ${expected} bytes, got ${value.length}`);
  }
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

const buildFlagsToken = (flags?: Bytes | null): ScriptToken => {
  if (!flags || flags.length === 0)
    return new ScriptToken(OpCode.OP_0, OpCode.OP_0);
  if (flags.length > 75) {
    throw new Error(`flags length must be <= 75 bytes, got ${flags.length}`);
  }

  return ScriptToken.fromBytes(flags);
};

const buildDataTokens = (values?: Bytes[]): ScriptToken[] => {
  if (!values || values.length === 0) return [];
  return values.map((v) => ScriptToken.fromBytes(v));
};

export const buildStas3FreezeMultisigTokens = (
  params: Stas3FreezeMultisigParams,
): ScriptToken[] => {
  const frozen = params.frozen === true;

  ensureLength(params.ownerPkh, 20, "ownerPkh");
  ensureLength(params.redemptionPkh, 20, "redemptionPkh");

  const ownerToken = buildOwnerToken(params.ownerPkh);
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
