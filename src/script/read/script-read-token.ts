import { OpCode } from "../../bitcoin/op-codes";
import { Bytes } from "../../bytes";
import { isOpCode } from "../script-utils";

export class ScriptReadToken {
  OpCodeNum: number;
  Data: Bytes;
  OpCode?: OpCode;

  constructor(opCodeNum: number, data?: Bytes) {
    this.OpCodeNum = opCodeNum;
    this.Data = data ?? new Uint8Array(0);

    const { valid } = isOpCode(opCodeNum);
    if (valid) this.OpCode = opCodeNum as OpCode;
  }
}
