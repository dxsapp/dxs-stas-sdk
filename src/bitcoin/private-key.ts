import {
  getPublicKey,
  Signature,
  signSync,
  utils,
  verify,
} from "@noble/secp256k1";
import { hmac } from "@noble/hashes/hmac";
import { sha256 } from "@noble/hashes/sha256";
import { getChunkSize, toBuffer } from "../buffer/buffer-utils";
import { Address } from "./address";
import { BufferWriter } from "../buffer";
import { hash256 } from "../hashes";

export { verify } from "@noble/secp256k1";

utils.hmacSha256Sync = (key, ...msgs) =>
  hmac(sha256, key, utils.concatBytes(...msgs));

utils.sha256Sync = (...msgs) => sha256(utils.concatBytes(...msgs));

export class PrivateKey {
  private _pk: Buffer;

  Address: Address;
  PublicKey: Buffer;

  constructor(pk: Buffer) {
    this._pk = pk;
    this.PublicKey = toBuffer(getPublicKey(this._pk, true));
    this.Address = Address.fromPublicKey(toBuffer(this.PublicKey));
  }

  sign = (message: Uint8Array) =>
    toBuffer(signSync(message, this._pk, { der: true }));

  verify = (signature: Buffer, message: Buffer) =>
    verify(signature, message, this.PublicKey);
}

export const verifyBitcoinSignedMessage = (
  message: Buffer,
  publicKey: Buffer,
  signature: Buffer
) => {
  const prefix = Buffer.from("Bitcoin Signed Message:\n");
  const writer = BufferWriter.fromSize(
    getChunkSize(prefix) + getChunkSize(message)
  );

  writer.writeVarChunk(prefix);
  writer.writeVarChunk(message);

  const sig = Signature.fromCompact(signature);

  return verify(sig, hash256(writer.buffer), publicKey);
};
