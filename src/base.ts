import { sha256 } from "@noble/hashes/sha2.js";
import { createBase58check } from "@scure/base";

export const bs58check = createBase58check(sha256);
