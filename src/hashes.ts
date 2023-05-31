import { sha256 as nobleHash256 } from "@noble/hashes/sha256";
import { ripemd160 as nobleRipemd160 } from "@noble/hashes/ripemd160";
import { toBuffer } from "./buffer/buffer-utils";

export const sha256 = (message: Buffer): Buffer =>
  toBuffer(nobleHash256(message));

export const ripemd160 = (message: Buffer): Buffer =>
  toBuffer(nobleRipemd160(message));

export const hash160 = (buffer: Buffer) => ripemd160(sha256(buffer));

export const hash256 = (buffer: Buffer) => sha256(sha256(buffer));
