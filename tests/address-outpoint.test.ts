import { Address } from "../src/bitcoin/address";
import { OutPoint } from "../src/bitcoin/out-point";
import { PrivateKey } from "../src/bitcoin/private-key";
import { ScriptType } from "../src/bitcoin/script-type";
import { TokenScheme } from "../src/bitcoin/token-scheme";
import { Transaction } from "../src/bitcoin/transaction";
import { TransactionOutput } from "../src/bitcoin/transaction-output";
import { TransactionReader } from "../src/transaction/read/transaction-reader";
import { fromHex } from "../src/bytes";
import { SourceTxRaw } from "./stas-transactios";
import {
  buildDstasFlags,
  buildDstasLockingTokens,
} from "../src/script/build/dstas-locking-builder";
import { ScriptBuilder } from "../src/script/build/script-builder";

describe("address and outpoint", () => {
  test("address construction from public key and hash160", () => {
    const pk = new PrivateKey(
      fromHex(
        "b62fd57a07804f79291317261054eb9b19c9ccec49146c38b30a29d48636c368",
      ),
    );

    expect(pk.Address.Value).toBe("1MkvWa82XHFqmRHaiRZ8BqZS7Uc83wekjp");

    const addrFromHash = Address.fromHash160Hex(
      "e3b111de8fec527b41f4189e313638075d96ccd6",
    );

    expect(addrFromHash.Value).toBe("1MkvWa82XHFqmRHaiRZ8BqZS7Uc83wekjp");
    expect(Address.fromBase58(addrFromHash.Value).Hash160.length).toBe(20);
  });

  test("outpoint created from a parsed transaction", () => {
    const tx = TransactionReader.readHex(SourceTxRaw);
    const outPoint = OutPoint.fromTransaction(tx, 0);

    expect(outPoint.TxId).toBe(tx.Id);
    expect(outPoint.Vout).toBe(0);
    expect(outPoint.Satoshis).toBe(tx.Outputs[0].Satoshis);
    expect(outPoint.ScriptType).toBe(ScriptType.p2pkh);
    expect(outPoint.Address!.Value).toBe("1MkvWa82XHFqmRHaiRZ8BqZS7Uc83wekjp");
    expect(outPoint.toString()).toBe(`${tx.Id}:0`);
  });

  test("outpoint from DSTAS multisig-owner output fails with explicit error", () => {
    const scheme = new TokenScheme(
      "Divisible STAS",
      "e3b111de8fec527b41f4189e313638075d96ccd6",
      "DST",
      1,
      {
        freeze: true,
        confiscation: false,
        isDivisible: true,
      },
    );

    const buildOwnerMultisigField = (m: number, keys: Uint8Array[]) => {
      const n = keys.length;
      const bytes = new Uint8Array(1 + n * (1 + 33) + 1);
      let offset = 0;
      bytes[offset++] = m & 0xff;
      for (const key of keys) {
        bytes[offset++] = 0x21;
        bytes.set(key, offset);
        offset += key.length;
      }
      bytes[offset] = n & 0xff;
      return bytes;
    };

    const ownerMultisigPreimage = buildOwnerMultisigField(2, [
      new PrivateKey(
        fromHex(
          "77b1b7d5bfe1288d94f829baba86d503e1a06b571aaa5d36820be19ef2fe520e",
        ),
      ).PublicKey,
      new PrivateKey(
        fromHex(
          "b62fd57a07804f79291317261054eb9b19c9ccec49146c38b30a29d48636c368",
        ),
      ).PublicKey,
      new PrivateKey(
        fromHex(
          "1f1c5a9f4e1c1d5d6f7b8a9c0b1c2d3e4f5061728394a5b6c7d8e9fafbfcfdfe",
        ),
      ).PublicKey,
    ]);

    const lockingScript = ScriptBuilder.fromTokens(
      buildDstasLockingTokens({
        owner: ownerMultisigPreimage,
        actionData: null,
        redemptionPkh: fromHex(scheme.TokenId),
        flags: buildDstasFlags({ freezable: true }),
        serviceFields: [new Uint8Array(20)],
      }),
      ScriptType.dstas,
    ).toBytes();

    const tx = new Transaction(
      new Uint8Array([0x00]),
      [],
      [new TransactionOutput(100, lockingScript)],
      1,
      0,
    );

    const outPoint = OutPoint.fromTransaction(tx, 0);

    expect(outPoint.ScriptType).toBe(ScriptType.dstas);
    expect(outPoint.Address).toBeUndefined();
  });
});
