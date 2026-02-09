import { getNumberBytes } from "../../buffer/buffer-utils";
import { ByteWriter } from "../../binary";
import { Address } from "../../bitcoin/address";
import { OpCode } from "../../bitcoin/op-codes";
import { ScriptType } from "../../bitcoin/script-type";
import { Bytes, toHex } from "../../bytes";
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
    const toAddress = ScriptBuilder.resolveToAddress(tokens, scriptType);
    const builder = new ScriptBuilder(scriptType, toAddress);
    builder._tokens = tokens;

    return builder;
  };

  private static resolveToAddress = (
    tokens: ScriptToken[],
    scriptType: ScriptType,
  ): Address | undefined => {
    const fromToken = (token?: ScriptToken): Address | undefined => {
      if (!token?.Data || token.Data.length !== 20) return undefined;
      return new Address(token.Data);
    };

    if (scriptType === ScriptType.p2pkh || scriptType === ScriptType.p2mpkh) {
      return fromToken(tokens.find((x) => x.IsReceiverId) ?? tokens[2]);
    }

    if (
      scriptType === ScriptType.p2stas ||
      scriptType === ScriptType.p2stas30
    ) {
      return fromToken(tokens.find((x) => x.IsReceiverId) ?? tokens[0]);
    }

    return undefined;
  };

  size = () => {
    let size = 0;

    for (const token of this._tokens) {
      size += this.tokenSize(token);
    }

    return size;
  };

  tokenSize = (token: ScriptToken) => {
    const size = 1;
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

  toBytes = () => {
    const buffer = new Uint8Array(this.size());
    const bufferWriter = new ByteWriter(buffer);

    for (const token of this._tokens) {
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

  toHex = () => toHex(this.toBytes());

  addToken = (token: ScriptToken) => {
    this._tokens.push(token);

    return this;
  };

  addOpCode = (opCode: OpCode) => {
    this._tokens.push(new ScriptToken(opCode, opCode));

    return this;
  };

  addData = (data: Bytes) => {
    this._tokens.push(ScriptToken.fromBytes(data));

    return this;
  };

  addDatas = (data: Bytes[]) => {
    for (const chunk of data) this._tokens.push(ScriptToken.fromBytes(chunk));

    return this;
  };

  addNumber = (data: number) => {
    if (data === 0) this.addOpCode(OpCode.OP_0);
    else if (data <= 16) this.addOpCode(0x50 + data);
    else this.addData(getNumberBytes(data));

    return this;
  };

  toAsm = () => {
    const opCodeKeys = Object.keys(OpCode);
    const opCodeValues = Object.values(OpCode);

    let result = "";

    for (const token of this._tokens) {
      if (result.length > 0) result += " ";

      if (token.Data) result += toHex(token.Data!);
      else result += opCodeKeys[opCodeValues.indexOf(token.OpCodeNum)];
    }

    return result;
  };
}
