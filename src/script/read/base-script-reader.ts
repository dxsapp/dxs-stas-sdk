import { ByteWriter } from "../../binary";
import { OpCode } from "../../bitcoin/op-codes";
import { Bytes } from "../../bytes";
import { ScriptReadToken } from "./script-read-token";

export abstract class BaseScriptReader {
  protected Source: Bytes;
  protected ExpectedLength: number;
  protected ReadBytes: number = 0;

  constructor(source: Bytes, expectedLength?: number) {
    this.Source = source;
    this.ExpectedLength = expectedLength ?? source.length;
  }

  protected abstract handleToken(
    token: ScriptReadToken,
    tokenIdx: number,
    isLastToken: boolean,
  ): boolean;

  protected readInternal(): number {
    let tokenIdx = 0;

    while (this.ReadBytes < this.ExpectedLength) {
      const opCodeNum = this.readUInt8();
      this.ReadBytes++;

      switch (opCodeNum) {
        case OpCode.OP_PUSHDATA1: {
          if (this.ReadBytes === this.ExpectedLength) {
            if (!this.handleRest(opCodeNum, tokenIdx)) return -1;
            break;
          }

          const count = this.readUInt8();
          this.ReadBytes++;

          if (!this.handleBytes(opCodeNum, count, tokenIdx, count)) return -1;
          break;
        }

        case OpCode.OP_PUSHDATA2: {
          if (this.ReadBytes + 2 >= this.ExpectedLength) {
            if (!this.handleRest(opCodeNum, tokenIdx)) return -1;
            break;
          }

          const count = this.readUInt16Le();
          this.ReadBytes += 2;

          if (!this.handleBytes(opCodeNum, count, tokenIdx, count)) return -1;
          break;
        }

        case OpCode.OP_PUSHDATA4: {
          if (this.ReadBytes + 4 >= this.ExpectedLength) {
            if (!this.handleRest(opCodeNum, tokenIdx)) return -1;
            break;
          }

          const count = this.readUInt32Le();
          this.ReadBytes += 4;

          if (!this.handleBytes(opCodeNum, count, tokenIdx, count)) return -1;
          break;
        }

        default: {
          if (opCodeNum > 0 && opCodeNum < OpCode.OP_PUSHDATA1) {
            const count = opCodeNum;
            if (!this.handleBytes(opCodeNum, count, tokenIdx, count)) return -1;
          } else {
            if (
              !this.handleTokenInternal(
                new ScriptReadToken(opCodeNum),
                tokenIdx,
                this.ReadBytes === this.ExpectedLength,
              )
            ) {
              return -1;
            }
          }

          break;
        }
      }

      tokenIdx++;
    }

    return tokenIdx;
  }

  private handleTokenInternal(
    token: ScriptReadToken,
    tokenIdx: number,
    isLastToken: boolean,
  ): boolean {
    return this.handleToken(token, tokenIdx, isLastToken);
  }

  private handleBytes(
    opCodeNum: number,
    count: number,
    tokenIdx: number,
    varInt: number,
  ): boolean {
    if (count + this.ReadBytes > this.ExpectedLength) {
      const rest = this.ExpectedLength - this.ReadBytes;
      const writer = ByteWriter.fromSize(1 + this.varIntLength(varInt) + rest);

      writer.writeUInt8(opCodeNum);
      writer.writeVarInt(varInt);

      if (rest > 0) writer.writeChunk(this.readNBytes(rest));

      this.ReadBytes += rest;

      return this.handleTokenInternal(
        new ScriptReadToken(opCodeNum, writer.buffer),
        tokenIdx,
        this.ReadBytes === this.ExpectedLength,
      );
    }

    const bytes = this.readNBytes(count);
    this.ReadBytes += count;

    return this.handleTokenInternal(
      new ScriptReadToken(opCodeNum, bytes),
      tokenIdx,
      this.ReadBytes === this.ExpectedLength,
    );
  }

  private handleRest(opCodeNum: number, tokenIdx: number): boolean {
    const count = this.ExpectedLength - this.ReadBytes;
    const bytes = count > 0 ? this.readNBytes(count) : undefined;

    // The C# implementation reads the rest bytes here and marks this as last token.
    // We additionally finalize ReadBytes to avoid re-reading the same tail in TS.
    this.ReadBytes = this.ExpectedLength;

    return this.handleTokenInternal(
      new ScriptReadToken(opCodeNum, bytes),
      tokenIdx,
      true,
    );
  }

  private readUInt8(): number {
    if (this.ReadBytes >= this.Source.length) {
      throw new Error("Read more bytes than expected");
    }
    return this.Source[this.ReadBytes];
  }

  private readUInt16Le(): number {
    if (this.ReadBytes + 1 >= this.Source.length) {
      throw new Error("Read more bytes than expected");
    }
    return this.Source[this.ReadBytes] | (this.Source[this.ReadBytes + 1] << 8);
  }

  private readUInt32Le(): number {
    if (this.ReadBytes + 3 >= this.Source.length) {
      throw new Error("Read more bytes than expected");
    }
    return (
      (this.Source[this.ReadBytes] |
        (this.Source[this.ReadBytes + 1] << 8) |
        (this.Source[this.ReadBytes + 2] << 16) |
        (this.Source[this.ReadBytes + 3] << 24)) >>>
      0
    );
  }

  private readNBytes(count: number): Bytes {
    if (count < 0 || this.ReadBytes + count > this.Source.length) {
      throw new Error("Read more bytes than expected");
    }
    return this.Source.subarray(this.ReadBytes, this.ReadBytes + count);
  }

  private varIntLength(value: number): number {
    if (value < 0xfd) return 1;
    if (value <= 0xffff) return 3;
    if (value <= 0xffffffff) return 5;
    return 9;
  }
}
