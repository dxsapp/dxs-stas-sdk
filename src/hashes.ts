import { sha256 as nobleHash256 } from "@noble/hashes/sha2.js";
import { ripemd160 as nobleRipemd160 } from "@noble/hashes/legacy.js";

export const sha256 = (message: Uint8Array): Uint8Array =>
  nobleHash256(message);

export const ripemd160 = (message: Uint8Array): Uint8Array =>
  nobleRipemd160(message);

export const hash160 = (buffer: Uint8Array) => ripemd160(sha256(buffer));

export const hash256 = (buffer: Uint8Array) => sha256(sha256(buffer));
