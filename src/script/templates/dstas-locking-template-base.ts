import { fromHex } from "../../bytes";
import { OpCode } from "../../bitcoin/op-codes";
import { ScriptToken } from "../script-token";
import { DSTAS_LOCKING_TEMPLATE_ASM } from "./dstas-locking-template";

export type TemplateToken = {
  op?: number;
  data?: string;
};

const REDEMPTION_PLACEHOLDER =
  '<"redemption address"/"protocol ID" - 20 bytes> <flags field> <service data per each flag> <optional data field/s - upto around 4.2GB size>';

const parseBaseAsmTokens = (templateAsm: string): TemplateToken[] => {
  const normalized = templateAsm.replace(/\s+/g, " ").trim();
  const headMarker = "<action data>";
  const headIdx = normalized.indexOf(headMarker);
  if (headIdx < 0) {
    throw new Error("DSTAS template is missing '<action data>' marker");
  }

  const bodyStart = headIdx + headMarker.length;
  const tailMarker = `OP_RETURN ${REDEMPTION_PLACEHOLDER}`;
  const tailIdx = normalized.indexOf(tailMarker, bodyStart);
  if (tailIdx < 0) {
    throw new Error("DSTAS template is missing redemption placeholder tail");
  }

  const body = `${normalized.slice(bodyStart, tailIdx).trim()} OP_RETURN`;
  const chunks = body.split(" ").filter(Boolean);
  const opCodes = OpCode as unknown as Record<string, number>;

  return chunks.map((chunk) => {
    if (chunk.startsWith("OP_")) {
      const normalizedOp = chunk === "OP_FALSE" ? "OP_0" : chunk;
      const op = opCodes[normalizedOp];
      if (typeof op !== "number") {
        throw new Error(`Unsupported opcode in DSTAS template: ${chunk}`);
      }
      return { op };
    }

    if (!/^[0-9a-fA-F]+$/.test(chunk)) {
      throw new Error(`Unsupported token in DSTAS template: ${chunk}`);
    }

    return { data: chunk.toLowerCase() };
  });
};

export const DSTAS_LOCKING_TEMPLATE_BASE: TemplateToken[] = parseBaseAsmTokens(
  DSTAS_LOCKING_TEMPLATE_ASM,
);

export const buildDstasTemplateBaseTokens = () =>
  DSTAS_LOCKING_TEMPLATE_BASE.map((t) => {
    if (t.data) return ScriptToken.fromBytes(fromHex(t.data));
    return new ScriptToken(t.op!, t.op!);
  });
