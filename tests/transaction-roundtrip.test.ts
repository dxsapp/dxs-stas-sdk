import { Address } from "../src/bitcoin/address";
import { OutPoint } from "../src/bitcoin/out-point";
import { PrivateKey } from "../src/bitcoin/private-key";
import { ScriptType } from "../src/bitcoin/script-type";
import { P2pkhBuilder } from "../src/script/build/p2pkh-builder";
import { TransactionBuilder } from "../src/transaction/build/transaction-builder";
import { TransactionReader } from "../src/transaction/read/transaction-reader";
import { fromHex } from "../src/bytes";

describe("transaction build/read round-trip", () => {
  test("builds, signs, and parses a simple p2pkh tx", () => {
    const pk = new PrivateKey(
      fromHex(
        "b62fd57a07804f79291317261054eb9b19c9ccec49146c38b30a29d48636c368",
      ),
    );
    const address = Address.fromBase58("1MkvWa82XHFqmRHaiRZ8BqZS7Uc83wekjp");
    const lockingScript = new P2pkhBuilder(address).toBytes();

    const outPoint = new OutPoint(
      "11".repeat(32),
      0,
      lockingScript,
      10_000,
      address,
      ScriptType.p2pkh,
    );

    const tx = TransactionBuilder.init()
      .addInput(outPoint, pk)
      .addP2PkhOutput(1_000, address)
      .addChangeOutputWithFee(address, outPoint.Satoshis - 1_000, 0.1)
      .sign();

    const hex = tx.toHex();
    const parsed = TransactionReader.readHex(hex);

    expect(parsed.Hex).toBe(hex);
    expect(parsed.Inputs.length).toBe(1);
    expect(parsed.Outputs.length).toBe(2);
    expect(parsed.Outputs[0].Satoshis).toBe(1_000);
    expect(parsed.Outputs[0].ScriptType).toBe(ScriptType.p2pkh);
    expect(parsed.Outputs[0].Address?.Value).toBe(address.Value);
    expect(parsed.Id).toHaveLength(64);
  });
});
