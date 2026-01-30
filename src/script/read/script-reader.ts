import { asMinimalOP, slice } from "../../buffer/buffer-utils";
import { OpCode } from "../../bitcoin/op-codes";
import { Bytes } from "../../bytes";
import { ScriptToken } from "../script-token";

export class ScriptReader {
  static read = (source: Bytes) => {
    const result = [];

    let i = 0;

    while (i < source.length) {
      const byte = source[i];

      // data chunk
      if (byte > OpCode.OP_0 && byte <= OpCode.OP_PUSHDATA4) {
        const d = ScriptReader.decode(source, i);

        // did reading a pushDataInt fail?
        if (d === null) return [];

        i += d.size;
        // attempt to read too much data?

        if (i + d.number > source.length) return [];

        const data = slice(source, i, i + d.number);
        i += d.number;

        // decompile minimally
        const op = asMinimalOP(data);

        if (op !== undefined) {
          result.push(new ScriptToken(byte, op));
        } else {
          result.push(ScriptToken.fromBytes(data));
        }
        // opcode
      } else {
        result.push(new ScriptToken(byte, byte));

        i += 1;
      }
    }

    return result;
  };

  static decode = (buffer: Bytes, offset: number) => {
    const opcode = buffer[offset];
    let num;
    let size;
    // ~6 bit
    if (opcode < OpCode.OP_PUSHDATA1) {
      num = opcode;
      size = 1;
      // 8 bit
    } else if (opcode === OpCode.OP_PUSHDATA1) {
      if (offset + 2 > buffer.length) return null;
      num = buffer[offset + 1];
      size = 2;
      // 16 bit
    } else if (opcode === OpCode.OP_PUSHDATA2) {
      if (offset + 3 > buffer.length) return null;
      num =
        buffer[offset + 1] | (buffer[offset + 2] << 8);
      size = 3;
      // 32 bit
    } else {
      if (offset + 5 > buffer.length) return null;
      if (opcode !== OpCode.OP_PUSHDATA4) throw new Error("Unexpected opcode");
      num =
        (buffer[offset + 1] |
          (buffer[offset + 2] << 8) |
          (buffer[offset + 3] << 16) |
          (buffer[offset + 4] << 24)) >>> 0;
      size = 5;
    }
    return {
      opcode,
      number: num,
      size,
    };
  };
}
