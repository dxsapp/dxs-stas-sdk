import { sign } from "@noble/secp256k1";
import { getChunkSize } from "../src/buffer/buffer-utils";
import { ByteWriter } from "../src/binary";
import { fromHex, utf8ToBytes } from "../src/bytes";
import { hash256 } from "../src/hashes";
import {
  PrivateKey,
  verifyBitcoinSignedMessage,
} from "../src/bitcoin/private-key";

const SECP256K1_N = BigInt(
  "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141",
);

const derS = (sig: Uint8Array): bigint => {
  if (sig.length < 8 || sig[0] !== 0x30) {
    throw new Error("Invalid DER signature");
  }
  const totalLen = sig[1];
  if (totalLen + 2 !== sig.length) {
    throw new Error("Invalid DER signature length");
  }

  let off = 2;
  if (sig[off++] !== 0x02) throw new Error("Invalid DER R marker");
  const rLen = sig[off++];
  off += rLen;
  if (sig[off++] !== 0x02) throw new Error("Invalid DER S marker");
  const sLen = sig[off++];
  const sBytes = sig.subarray(off, off + sLen);

  let s = BigInt(0);
  for (const b of sBytes) {
    s = (s << BigInt(8)) | BigInt(b);
  }
  return s;
};

describe("private key signing", () => {
  test("sign is deterministic and low-S", () => {
    const pkBytes = fromHex(
      "77b1b7d5bfe1288d94f829baba86d503e1a06b571aaa5d36820be19ef2fe520e",
    );
    const pk = new PrivateKey(pkBytes);
    const message = utf8ToBytes("deterministic signature check");

    const sigA = pk.sign(message);
    const sigB = pk.sign(message);

    expect(sigA).toEqual(sigB);
    expect(derS(sigA) <= SECP256K1_N / BigInt(2)).toBe(true);
  });

  test("sign/verify round-trip with DER signatures", () => {
    const pkBytes = fromHex(
      "77b1b7d5bfe1288d94f829baba86d503e1a06b571aaa5d36820be19ef2fe520e",
    );
    const pk = new PrivateKey(pkBytes);
    const message = utf8ToBytes("hello from dxs");

    const signature = pk.sign(message);

    expect(signature[0]).toBe(0x30);
    expect(pk.verify(signature, message)).toBe(true);
    expect(pk.verify(signature, utf8ToBytes("different"))).toBe(false);
  });

  test("verify bitcoin signed message with compact signature", () => {
    const pkBytes = fromHex(
      "77b1b7d5bfe1288d94f829baba86d503e1a06b571aaa5d36820be19ef2fe520e",
    );
    const pk = new PrivateKey(pkBytes);
    const message = utf8ToBytes("bitcoin signed message test");

    const prefix = utf8ToBytes("Bitcoin Signed Message:\n");
    const writer = ByteWriter.fromSize(
      getChunkSize(prefix) + getChunkSize(message),
    );
    writer.writeVarChunk(prefix);
    writer.writeVarChunk(message);

    const digest = hash256(writer.buffer);
    const signature = sign(digest, pkBytes, {
      prehash: false,
      format: "compact",
    });

    expect(verifyBitcoinSignedMessage(message, pk.PublicKey, signature)).toBe(
      true,
    );
  });

  test("dispose zeroizes private key and blocks signing", () => {
    const pkBytes = fromHex(
      "77b1b7d5bfe1288d94f829baba86d503e1a06b571aaa5d36820be19ef2fe520e",
    );
    const pk = new PrivateKey(pkBytes);
    const internal = (pk as any)._pk as Uint8Array;

    pk.dispose();

    expect(Array.from(internal).every((b) => b === 0)).toBe(true);
    expect(() => pk.sign(utf8ToBytes("should fail"))).toThrow("disposed");
  });
});
