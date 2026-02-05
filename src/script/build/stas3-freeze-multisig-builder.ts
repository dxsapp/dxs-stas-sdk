import { Bytes, toHex } from "../../bytes";
import { getNumberBytes } from "../../buffer/buffer-utils";
import { asmToBytes } from "./asm-template-builder";
import { STAS3_FREEZE_MULTISIG_TEMPLATE_ASM } from "../templates/stas3-freeze-multisig";

export type SecondFieldInput = Bytes | number | null;

export type Stas3FreezeMultisigParams = {
  ownerPkh: Bytes;
  secondField: SecondFieldInput;
  redemptionPkh: Bytes;
  frozen?: boolean;
  flags?: Bytes | null;
  serviceFields?: Bytes[];
  optionalData?: Bytes[];
  templateAsm?: string;
};

const ensureLength = (value: Bytes, expected: number, name: string) => {
  if (value.length !== expected) {
    throw new Error(`${name} must be ${expected} bytes, got ${value.length}`);
  }
};

const encodeSecondFieldToken = (
  field: SecondFieldInput,
  frozen: boolean,
): string => {
  if (field === null) {
    return frozen ? "OP_2" : "OP_0";
  }

  if (typeof field !== "number" && field.length === 0) {
    return frozen ? "OP_2" : "OP_0";
  }

  const raw =
    typeof field === "number" ? getNumberBytes(field) : new Uint8Array(field);

  if (!frozen) return toHex(raw);

  const prefixed = new Uint8Array(raw.length + 1);
  prefixed[0] = 0x02;
  prefixed.set(raw, 1);

  return toHex(prefixed);
};

const encodeFlagsToken = (flags?: Bytes | null): string => {
  if (!flags || flags.length === 0) return "OP_0";
  if (flags.length > 75) {
    throw new Error(`flags length must be <= 75 bytes, got ${flags.length}`);
  }

  return toHex(flags);
};

const encodeDataTokens = (values?: Bytes[]): string => {
  if (!values || values.length === 0) return "";
  return values.map((v) => toHex(v)).join(" ");
};

const normalizeAsm = (asm: string) => asm.trim().replace(/\s+/g, " ");

export const buildStas3FreezeMultisigAsm = (
  params: Stas3FreezeMultisigParams,
): string => {
  const template = params.templateAsm ?? STAS3_FREEZE_MULTISIG_TEMPLATE_ASM;
  const frozen = params.frozen === true;

  ensureLength(params.ownerPkh, 20, "ownerPkh");
  ensureLength(params.redemptionPkh, 20, "redemptionPkh");

  const ownerToken = toHex(params.ownerPkh);
  const secondToken = encodeSecondFieldToken(params.secondField, frozen);
  const redemptionToken = toHex(params.redemptionPkh);
  const flagsToken = encodeFlagsToken(params.flags);
  const serviceTokens = encodeDataTokens(params.serviceFields);
  const optionalTokens = encodeDataTokens(params.optionalData);

  if (!params.flags && params.serviceFields && params.serviceFields.length > 0) {
    throw new Error("serviceFields require flags to be provided");
  }

  let asm = template
    .replace("<owner address/MPKH - 20 bytes>", ownerToken)
    .replace("<2nd variable field>", secondToken)
    .replace(
      '<"redemption address"/"protocol ID" - 20 bytes>',
      redemptionToken,
    )
    .replace("<flags field>", flagsToken)
    .replace("<service data per each flag>", serviceTokens)
    .replace("<optional data field/s - upto around 4.2GB size>", optionalTokens);

  return normalizeAsm(asm);
};

export const buildStas3FreezeMultisigScript = (
  params: Stas3FreezeMultisigParams,
): Bytes => asmToBytes(buildStas3FreezeMultisigAsm(params));
