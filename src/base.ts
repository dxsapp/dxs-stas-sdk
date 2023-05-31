import { sha256 } from "@noble/hashes/sha256";
import { base58check } from "@scure/base";

export const bs58check = base58check(sha256);
