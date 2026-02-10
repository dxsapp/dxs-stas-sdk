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
  buildStas3Flags,
  buildStas3FreezeMultisigTokens,
} from "../src/script/build/stas3-freeze-multisig-builder";
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
    expect(outPoint.Address.Value).toBe("1MkvWa82XHFqmRHaiRZ8BqZS7Uc83wekjp");
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

    const ownerMultisigPreimage = new Uint8Array(35);
    ownerMultisigPreimage[0] = 0x21;
    ownerMultisigPreimage[1] = 0x02;

    const lockingScript = ScriptBuilder.fromTokens(
      buildStas3FreezeMultisigTokens({
        owner: ownerMultisigPreimage,
        actionData: null,
        redemptionPkh: fromHex(scheme.TokenId),
        flags: buildStas3Flags({ freezable: true }),
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

    expect(() => OutPoint.fromTransaction(tx, 0)).toThrow(
      "Output does not expose address",
    );
  });
});
