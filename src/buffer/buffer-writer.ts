import { ensureUInt } from "./buffer-utils";

export class BufferWriter {
  buffer: Buffer;
  offset: number;

  constructor(buffer: Buffer, offset = 0) {
    this.buffer = buffer;
    this.offset = offset;
  }

  static fromSize = (size: number) =>
    new BufferWriter(Buffer.allocUnsafe(size));

  writeUInt8(value: number) {
    this.offset = this.buffer.writeUInt8(value, this.offset);
  }

  writeUInt16(value: number) {
    this.offset = this.buffer.writeUInt16LE(value, this.offset);
  }

  writeUInt32(value: number) {
    this.offset = this.buffer.writeUInt32LE(value, this.offset);
  }

  writeUInt64(value: number) {
    ensureUInt(value, 0x001fffffffffffff);

    this.buffer.writeInt32LE(value & -1, this.offset);
    this.buffer.writeUInt32LE(Math.floor(value / 0x100000000), this.offset + 4);
    this.offset += 8;
  }

  writeVarInt(value: number) {
    // 8 bit
    if (value <= 0xfc) {
      this.writeUInt8(value);

      // 16 bit
    } else if (value <= 0xffff) {
      this.writeUInt8(0xfd);
      this.writeUInt16(value);

      // 32 bit
    } else if (value <= 0xffffffff) {
      this.writeUInt8(0xfe);
      this.writeUInt32(value);

      // 64 bit
    } else {
      this.writeUInt8(0xff);
      this.writeUInt64(value);
    }
  }

  writeChunk(chunk: Buffer) {
    if (this.buffer.length < this.offset + chunk.length)
      throw new Error(
        `Cannot writte chunk out of bounds; total size: ${
          this.buffer.length
        }; position: ${this.offset}; excess: ${
          this.offset + chunk.length - this.buffer.length
        }`
      );

    this.offset += chunk.copy(this.buffer, this.offset);
  }

  writeVarChunk(chunk: Buffer) {
    this.writeVarInt(chunk.length);
    this.writeChunk(chunk);
  }
}
