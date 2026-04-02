import { PrivateKey } from "../src/bitcoin/private-key";
import { TransactionInput } from "../src/bitcoin/transaction-input";
import { ScriptType } from "../src/bitcoin/script-type";
import { fromHex } from "../src/bytes";
import { ScriptBuilder } from "../src/script/build/script-builder";
import { ScriptToken } from "../src/script/script-token";

describe("transaction input", () => {
  test("extracts address from compressed pubkey tail", () => {
    const signer = new PrivateKey(fromHex("11".repeat(32)));
    const unlockingScript = ScriptBuilder.fromTokens([
      ScriptToken.fromBytes(fromHex("aa".repeat(71))),
      ScriptToken.fromBytes(signer.PublicKey),
    ], ScriptType.unknown).toBytes();

    const input = new TransactionInput(
      "aa".repeat(32),
      0,
      unlockingScript,
      0xffffffff,
    );

    expect(input.tryGetAddress()?.Value).toBe(signer.Address.Value);
  });

  test("returns undefined for empty unlocking script", () => {
    const input = new TransactionInput(
      "bb".repeat(32),
      1,
      new Uint8Array(0),
      0xffffffff,
    );

    expect(input.tryGetAddress()).toBeUndefined();
  });

  test("returns undefined when last token is not a compressed pubkey", () => {
    const unlockingScript = ScriptBuilder.fromTokens([
      ScriptToken.fromBytes(fromHex("aa".repeat(71))),
      ScriptToken.fromBytes(fromHex("04" + "11".repeat(64))),
    ], ScriptType.unknown).toBytes();

    const input = new TransactionInput(
      "cc".repeat(32),
      2,
      unlockingScript,
      0xffffffff,
    );

    expect(input.tryGetAddress()).toBeUndefined();
  });
});
