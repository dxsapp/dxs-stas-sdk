import { sign } from "@noble/secp256k1";
import { getChunkSize } from "../src/buffer/buffer-utils";
import { ByteWriter } from "../src/binary";
import { fromHex, utf8ToBytes } from "../src/bytes";
import { hash256 } from "../src/hashes";
import {
  PrivateKey,
  verifyBitcoinSignedMessage,
} from "../src/bitcoin/private-key";

describe("private key signing", () => {
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
});
