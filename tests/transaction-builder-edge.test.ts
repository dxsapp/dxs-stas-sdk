import { Address } from "../src/bitcoin/address";
import { OutPoint } from "../src/bitcoin/out-point";
import { PrivateKey } from "../src/bitcoin/private-key";
import { ScriptType } from "../src/bitcoin/script-type";
import { TransactionBuilder, TransactionBuilderError } from "../src/transaction/build/transaction-builder";
import { fromHex } from "../src/bytes";
import { P2pkhBuilder } from "../src/script/build/p2pkh-builder";
import { P2stasBuilder } from "../src/script/build/p2stas-builder";

const issuer = new PrivateKey(fromHex("b62fd57a07804f79291317261054eb9b19c9ccec49146c38b30a29d48636c368"));
const recipient = Address.fromBase58("1C2dVLqv1kjNn7pztpQ51bpXVEJfoWUNxe");

const buildP2pkhOutPoint = (satoshis: number) =>
  new OutPoint(
    "aa".repeat(32),
    0,
    new P2pkhBuilder(issuer.Address).toBytes(),
    satoshis,
    issuer.Address,
    ScriptType.p2pkh,
  );

describe("transaction builder edge cases", () => {
  test("throws when change cannot pay fee", () => {
    const builder = TransactionBuilder.init()
      .addInput(buildP2pkhOutPoint(1000), issuer)
      .addP2PkhOutput(900, recipient);

    expect(() =>
      builder.addChangeOutputWithFee(issuer.Address, 1, 1),
    ).toThrow(TransactionBuilderError);
    expect(() =>
      builder.addChangeOutputWithFee(issuer.Address, 1, 1),
    ).toThrow("Insufficient satoshis to pay fee");
  });

  test("rebuilds stas output from previous locking script payload", () => {
    const prevLockingScript = new P2stasBuilder(
      issuer.Address,
      "11".repeat(20),
      "DXS",
      [fromHex("aa55")],
    ).toBytes();

    const builder = TransactionBuilder.init().addStasOutputByPrevLockingScript(
      25,
      recipient,
      prevLockingScript,
    );

    expect(builder.Outputs).toHaveLength(1);
    expect(builder.Outputs[0].Satoshis).toBe(25);
  });

  test("rejects previous locking script without OP_RETURN payload marker", () => {
    expect(() =>
      TransactionBuilder.init().addStasOutputByPrevLockingScript(
        1,
        recipient,
        new P2pkhBuilder(issuer.Address).toBytes(),
      ),
    ).toThrow("Invalid STAS locking script");
  });

  test("rejects opcode tokens after STAS payload", () => {
    const malformed = new Uint8Array([
      ...new P2pkhBuilder(issuer.Address).toBytes(),
      0x6a,
      0x14,
      ...fromHex("11".repeat(20)),
      0x03,
      ...fromHex("445853"),
      0x51,
    ]);

    expect(() =>
      TransactionBuilder.init().addStasOutputByPrevLockingScript(
        1,
        recipient,
        malformed,
      ),
    ).toThrow("Invalid STAS locking script");
  });
});
