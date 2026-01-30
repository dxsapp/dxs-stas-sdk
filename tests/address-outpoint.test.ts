import { Address } from "../src/bitcoin/address";
import { OutPoint } from "../src/bitcoin/out-point";
import { PrivateKey } from "../src/bitcoin/private-key";
import { ScriptType } from "../src/bitcoin/script-type";
import { TransactionReader } from "../src/transaction/read/transaction-reader";
import { fromHex } from "../src/bytes";
import { SourceTxRaw } from "./stas-transactios";

describe("address and outpoint", () => {
  test("address construction from public key and hash160", () => {
    const pk = new PrivateKey(
      fromHex(
        "b62fd57a07804f79291317261054eb9b19c9ccec49146c38b30a29d48636c368"
      )
    );

    expect(pk.Address.Value).toBe("1MkvWa82XHFqmRHaiRZ8BqZS7Uc83wekjp");

    const addrFromHash = Address.fromHash160Hex(
      "e3b111de8fec527b41f4189e313638075d96ccd6"
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
});
