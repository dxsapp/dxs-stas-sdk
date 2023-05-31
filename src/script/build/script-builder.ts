import { getNumberBuffer } from "../../buffer/buffer-utils";
import { BufferWriter } from "../../buffer/buffer-writer";
import { Address } from "../../bitcoin/address";
import { OpCode } from "../../bitcoin/op-codes";
import { ScriptType } from "../../bitcoin/script-type";
import { ScriptToken } from "../script-token";

export class ScriptBuilder {
  _tokens: ScriptToken[] = [];

  ScriptType: ScriptType;
  ToAddress?: Address;

  constructor(scriptType: ScriptType, toAddress?: Address) {
    this.ScriptType = scriptType;
    this.ToAddress = toAddress;
  }

  static fromTokens = (tokens: ScriptToken[], scriptType: ScriptType) => {
    const builder = new ScriptBuilder(scriptType);
    builder._tokens = tokens;

    return builder;
  };

  size = () => {
    let size = 0;

    for (const token of this._tokens) {
      size += this.tokenSize(token);
    }

    return size;
  };

  tokenSize = (token: ScriptToken) => {
    let size = 1;

    const opcodeNum = token.OpCodeNum;
    const dataLength = token.DataLength;
    const add =
      opcodeNum > 0 && opcodeNum < OpCode.OP_PUSHDATA1
        ? dataLength
        : opcodeNum === OpCode.OP_PUSHDATA1
        ? dataLength + 1
        : opcodeNum === OpCode.OP_PUSHDATA2
        ? dataLength + 2
        : opcodeNum === OpCode.OP_PUSHDATA4
        ? dataLength + 4
        : 0;

    return size + add;
  };

  toBuffer = () => {
    const buffer = Buffer.alloc(this.size());
    const bufferWriter = new BufferWriter(buffer);

    for (var token of this._tokens) {
      bufferWriter.writeUInt8(token.OpCodeNum);

      if (token.OpCodeNum > 0 && token.OpCodeNum < OpCode.OP_PUSHDATA1) {
        bufferWriter.writeChunk(token.Data!);
      } else if (token.OpCodeNum === OpCode.OP_PUSHDATA1) {
        bufferWriter.writeUInt8(token.DataLength);
        bufferWriter.writeChunk(token.Data!);
      } else if (token.OpCodeNum === OpCode.OP_PUSHDATA2) {
        bufferWriter.writeUInt16(token.DataLength);
        bufferWriter.writeChunk(token.Data!);
      } else if (token.OpCodeNum === OpCode.OP_PUSHDATA4) {
        bufferWriter.writeUInt32(token.DataLength);
        bufferWriter.writeChunk(token.Data!);
      }
    }

    return buffer;
  };

  toHex = () => this.toBuffer().toString("hex");

  addToken = (token: ScriptToken) => {
    this._tokens.push(token);

    return this;
  };

  addOpCode = (opCode: OpCode) => {
    this._tokens.push(new ScriptToken(opCode, opCode));

    return this;
  };

  addData = (data: Buffer) => {
    this._tokens.push(ScriptToken.fromBuffer(data));

    return this;
  };

  addDatas = (data: Buffer[]) => {
    for (const chunk of data) this._tokens.push(ScriptToken.fromBuffer(chunk));

    return this;
  };

  addNumber = (data: number) => {
    if (data === 0) this.addOpCode(OpCode.OP_0);
    else if (data <= 16) this.addOpCode(0x50 + data);
    else this.addData(getNumberBuffer(data));

    return this;
  };

  toAsm = () => {
    const opCodeKeys = Object.keys(OpCode);
    const opCodeValues = Object.values(OpCode);

    let result = "";

    for (const token of this._tokens) {
      if (result.length > 0) result += " ";

      if (token.Data) result += token.Data!.toString("hex");
      else result += opCodeKeys[opCodeValues.indexOf(token.OpCodeNum)];
    }

    return result;
  };
}
