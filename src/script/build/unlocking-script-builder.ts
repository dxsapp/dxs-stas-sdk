import { OpCode } from "../../bitcoin/op-codes";
import { Bytes } from "../../bytes";
import { ScriptBuilder } from "./script-builder";
import { ScriptType } from "../../bitcoin/script-type";

export type ScriptChunk = { op: OpCode } | { data: Bytes } | { number: number };

export const buildUnlockingScript = (chunks: ScriptChunk[]): Bytes => {
  const builder = new ScriptBuilder(ScriptType.unknown);

  for (const chunk of chunks) {
    if ("op" in chunk) builder.addOpCode(chunk.op);
    else if ("number" in chunk) builder.addNumber(chunk.number);
    else builder.addData(chunk.data);
  }

  return builder.toBytes();
};
