import { OpCode } from "../../bitcoin/op-codes";
import { ScriptType } from "../../bitcoin/script-type";
import { fromHex } from "../../bytes";
import { ScriptBuilder } from "./script-builder";
import { ScriptToken } from "../script-token";

const isHex = (value: string) => /^[0-9a-fA-F]+$/.test(value);

const toOpcode = (token: string): number | undefined => {
  if (token === "OP_FALSE") return OpCode.OP_0;
  if (token === "OP_TRUE") return OpCode.OP_1;

  const maybe = (OpCode as unknown as Record<string, number>)[token];
  if (typeof maybe === "number") return maybe;

  return undefined;
};

export const asmToTokens = (asm: string): ScriptToken[] => {
  const tokens = asm.trim().split(/\s+/).filter(Boolean);
  const result: ScriptToken[] = [];

  for (const token of tokens) {
    if (token.startsWith("<") && token.endsWith(">")) {
      throw new Error(`Unresolved template placeholder: ${token}`);
    }

    if (token.startsWith("OP_")) {
      const opcode = toOpcode(token);
      if (opcode === undefined) {
        throw new Error(`Unknown opcode token: ${token}`);
      }
      result.push(new ScriptToken(opcode, opcode));
      continue;
    }

    if (!isHex(token)) {
      throw new Error(`Invalid ASM token: ${token}`);
    }

    const bytes = fromHex(token);
    result.push(ScriptToken.fromBytes(bytes));
  }

  return result;
};

export const asmToBytes = (asm: string) => {
  const tokens = asmToTokens(asm);
  const builder = ScriptBuilder.fromTokens(tokens, ScriptType.unknown);
  return builder.toBytes();
};
