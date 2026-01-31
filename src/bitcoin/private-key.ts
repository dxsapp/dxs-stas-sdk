import {
  getPublicKey,
  Signature,
  hashes,
  sign,
  verify,
} from "@noble/secp256k1";
import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { getChunkSize } from "../buffer/buffer-utils";
import { Address } from "./address";
import { ByteWriter } from "../binary";
import { hash256 } from "../hashes";
import { Bytes, concat, fromHex, toHex, utf8ToBytes } from "../bytes";

export { verify } from "@noble/secp256k1";

hashes.hmacSha256 = (key, msg) => hmac(sha256, key, msg);
hashes.sha256 = (msg) => sha256(msg);

const bigintToBytes = (value: bigint) => {
  let hex = value.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  let bytes = fromHex(hex);

  if (bytes.length > 0 && (bytes[0] & 0x80) !== 0) {
    bytes = concat([new Uint8Array([0x00]), bytes]);
  }

  return bytes;
};

const bytesToBigInt = (bytes: Bytes) => {
  if (bytes.length === 0) return BigInt(0);
  return BigInt(`0x${toHex(bytes)}`);
};

const derEncodeSignature = (signature: Signature) => {
  const r = bigintToBytes(signature.r);
  const s = bigintToBytes(signature.s);
  const totalLen = 2 + r.length + 2 + s.length;

  return concat([
    new Uint8Array([0x30, totalLen, 0x02, r.length]),
    r,
    new Uint8Array([0x02, s.length]),
    s,
  ]);
};

const derDecodeSignature = (der: Bytes) => {
  if (der.length < 8 || der[0] !== 0x30) {
    throw new Error("Invalid DER signature");
  }

  const totalLen = der[1];
  if (totalLen + 2 !== der.length) {
    throw new Error("Invalid DER signature length");
  }

  let offset = 2;
  if (der[offset++] !== 0x02) throw new Error("Invalid DER signature");
  const rLen = der[offset++];
  const r = der.subarray(offset, offset + rLen);
  offset += rLen;

  if (der[offset++] !== 0x02) throw new Error("Invalid DER signature");
  const sLen = der[offset++];
  const s = der.subarray(offset, offset + sLen);

  return new Signature(bytesToBigInt(r), bytesToBigInt(s));
};

export class PrivateKey {
  private _pk: Bytes;

  Address: Address;
  PublicKey: Bytes;

  constructor(pk: Bytes) {
    this._pk = pk;
    this.PublicKey = getPublicKey(this._pk, true);
    this.Address = Address.fromPublicKey(this.PublicKey);
  }

  sign = (message: Bytes) =>
    derEncodeSignature(
      Signature.fromBytes(sign(message, this._pk, { prehash: false })),
    );

  verify = (signature: Bytes, message: Bytes) => {
    const sig =
      signature.length > 0 && signature[0] === 0x30
        ? derDecodeSignature(signature).toBytes()
        : signature;

    return verify(sig, message, this.PublicKey, {
      prehash: false,
      format: "compact",
    });
  };
}

export const verifyBitcoinSignedMessage = (
  message: Bytes,
  publicKey: Bytes,
  signature: Bytes,
) => {
  const prefix = utf8ToBytes("Bitcoin Signed Message:\n");
  const writer = ByteWriter.fromSize(
    getChunkSize(prefix) + getChunkSize(message),
  );

  writer.writeVarChunk(prefix);
  writer.writeVarChunk(message);

  return verify(signature, hash256(writer.buffer), publicKey, {
    prehash: false,
    format: "compact",
  });
};
