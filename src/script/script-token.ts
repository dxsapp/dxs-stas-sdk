import { OpCode } from "../bitcoin/op-codes";
import { isOpCode } from "./script-utils";
import { Bytes } from "../bytes";

export class ScriptToken {
  OpCodeNum: number;
  OpCode?: OpCode;
  Data?: Bytes;
  DataLength: number = 0;
  IsReceiverId: boolean = false;

  constructor(opCodeNum: number, opCode?: OpCode) {
    this.OpCode = opCode;
    this.OpCodeNum = opCodeNum;
  }

  static fromBytes(buffer: Bytes) {
    const opCodeNum =
      buffer.length === 0
        ? -1
        : buffer.length < 76
          ? buffer.length
          : buffer.length <= 255
            ? OpCode.OP_PUSHDATA1
            : buffer.length <= 65535
              ? OpCode.OP_PUSHDATA2
              : buffer.length <= 4294967295
                ? OpCode.OP_PUSHDATA4
                : -1;

    if (opCodeNum === -1) throw new Error(`No data provided: ${buffer.length}`);

    const token = new ScriptToken(opCodeNum);

    token.Data = buffer;
    token.DataLength = buffer.length;

    return token;
  }

  static fromScriptToken(from: ScriptToken) {
    const token = from.Data
      ? ScriptToken.fromBytes(from.Data)
      : new ScriptToken(from.OpCodeNum, from.OpCode);

    token.IsReceiverId = from.IsReceiverId;

    return token;
  }

  static forSample(
    opCodeNum: number,
    dataLength: number = 0,
    isReceiverId: boolean = false,
  ) {
    const token = new ScriptToken(opCodeNum);

    const { valid, opCode } = isOpCode(opCodeNum);

    if (valid === false) token.OpCode = opCode;

    token.DataLength = dataLength;
    token.IsReceiverId = isReceiverId;

    return token;
  }
}
