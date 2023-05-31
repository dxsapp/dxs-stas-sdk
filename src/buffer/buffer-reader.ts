import { ensureUInt, slice } from "./buffer-utils";

export class BufferReader {
  buffer: Buffer;
  offset: number;

  constructor(buffer: Buffer, offset = 0) {
    this.buffer = buffer;
    this.offset = offset;
  }

  readUInt8() {
    const result = this.buffer.readUInt8(this.offset);
    this.offset++;

    return result;
  }

  readUInt16() {
    const result = this.buffer.readUInt16LE(this.offset);
    this.offset += 2;

    return result;
  }

  readInt32() {
    const result = this.buffer.readInt32LE(this.offset);
    this.offset += 4;

    return result;
  }

  readUInt32() {
    const result = this.buffer.readUInt32LE(this.offset);
    this.offset += 4;

    return result;
  }

  readUInt64() {
    const a = this.buffer.readUInt32LE(this.offset);
    let b = this.buffer.readUInt32LE(this.offset + 4);
    b *= 0x100000000;

    const result = b + a;
    ensureUInt(result, 0x001fffffffffffff);

    this.offset += 8;

    return result;
  }

  readVarInt() {
    var first = this.readUInt8();

    // 8 bit
    if (first < 0xfd) {
      return first;
    }

    // 16 bit
    if (first === 0xfd) {
      return this.readUInt16();
    }

    // 32 bit
    if (first === 0xfe) {
      return this.readUInt32();
    }

    // 64 bit
    return this.readUInt64();
  }

  readChunk(n: number) {
    if (this.buffer.length < this.offset + n) {
      throw new Error("Cannot read chunk out of bounds");
    }
    const result = slice(this.buffer, this.offset, this.offset + n);
    this.offset += n;

    return result;
  }

  readVarChunk() {
    return this.readChunk(this.readVarInt());
  }
}
