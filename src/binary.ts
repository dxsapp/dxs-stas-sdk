import { Bytes } from "./bytes";
import { ensureUInt } from "./buffer/buffer-utils";

export class ByteReader {
  buffer: Bytes;
  view: DataView;
  offset: number;

  constructor(buffer: Bytes, offset = 0) {
    this.buffer = buffer;
    this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    this.offset = offset;
  }

  readUInt8() {
    const result = this.view.getUint8(this.offset);
    this.offset += 1;
    return result;
  }

  readUInt16() {
    const result = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return result;
  }

  readInt32() {
    const result = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return result;
  }

  readUInt32() {
    const result = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return result;
  }

  readUInt64() {
    const a = this.view.getUint32(this.offset, true);
    const b = this.view.getUint32(this.offset + 4, true);
    const result = b * 0x100000000 + a;
    ensureUInt(result, 0x001fffffffffffff);
    this.offset += 8;
    return result;
  }

  readVarInt() {
    const first = this.readUInt8();
    if (first < 0xfd) return first;
    if (first === 0xfd) return this.readUInt16();
    if (first === 0xfe) return this.readUInt32();
    return this.readUInt64();
  }

  readChunk(n: number) {
    if (this.buffer.length < this.offset + n)
      throw new Error("Cannot read chunk out of bounds");

    const result = this.buffer.slice(this.offset, this.offset + n);
    this.offset += n;

    return result;
  }

  readVarChunk() {
    return this.readChunk(this.readVarInt());
  }
}

export class ByteWriter {
  buffer: Bytes;
  view: DataView;
  offset: number;

  constructor(buffer: Bytes, offset = 0) {
    this.buffer = buffer;
    this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    this.offset = offset;
  }

  static fromSize = (size: number) => new ByteWriter(new Uint8Array(size));

  writeUInt8(value: number) {
    this.view.setUint8(this.offset, value);
    this.offset += 1;
  }

  writeUInt16(value: number) {
    this.view.setUint16(this.offset, value, true);
    this.offset += 2;
  }

  writeUInt32(value: number) {
    this.view.setUint32(this.offset, value, true);
    this.offset += 4;
  }

  writeUInt64(value: number) {
    ensureUInt(value, 0x001fffffffffffff);

    const low = value & -1;
    const high = Math.floor(value / 0x100000000);

    this.view.setInt32(this.offset, low, true);
    this.view.setUint32(this.offset + 4, high, true);
    this.offset += 8;
  }

  writeVarInt(value: number) {
    if (value <= 0xfc) {
      this.writeUInt8(value);
    } else if (value <= 0xffff) {
      this.writeUInt8(0xfd);
      this.writeUInt16(value);
    } else if (value <= 0xffffffff) {
      this.writeUInt8(0xfe);
      this.writeUInt32(value);
    } else {
      this.writeUInt8(0xff);
      this.writeUInt64(value);
    }
  }

  writeChunk(chunk: Bytes) {
    if (this.buffer.length < this.offset + chunk.length)
      throw new Error(
        `Cannot writte chunk out of bounds; total size: ${
          this.buffer.length
        }; position: ${this.offset}; excess: ${
          this.offset + chunk.length - this.buffer.length
        }`
      );

    this.buffer.set(chunk, this.offset);
    this.offset += chunk.length;
  }

  writeVarChunk(chunk: Bytes) {
    this.writeVarInt(chunk.length);
    this.writeChunk(chunk);
  }
}
