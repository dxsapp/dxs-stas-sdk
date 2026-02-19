import { Address } from "../src/bitcoin/address";
import { OutPoint } from "../src/bitcoin/out-point";
import { ScriptType } from "../src/bitcoin/script-type";
import { TransactionOutput } from "../src/bitcoin/transaction-output";
import { fromHex, toHex } from "../src/bytes";

const p2pkhScript = fromHex(
  "76a914e3b111de8fec527b41f4189e313638075d96ccd688ac",
);

describe("locking script aliases", () => {
  test("TransactionOutput exposes canonical LockingScript and legacy alias", () => {
    const out = new TransactionOutput(1000, p2pkhScript);

    expect(toHex(out.LockingScript)).toBe(toHex(p2pkhScript));
    expect(toHex(out.LockignScript)).toBe(toHex(p2pkhScript));

    const next = fromHex("76a9146b7f6a5d5677d1f3635e589b2eacc75d08dc6c4588ac");
    out.LockingScript = next;
    expect(toHex(out.LockignScript)).toBe(toHex(next));
  });

  test("OutPoint exposes canonical LockingScript and legacy alias", () => {
    const address = Address.fromBase58("1MkvWa82XHFqmRHaiRZ8BqZS7Uc83wekjp");
    const outPoint = new OutPoint(
      "11".repeat(32),
      0,
      p2pkhScript,
      5000,
      address,
      ScriptType.p2pkh,
    );

    expect(toHex(outPoint.LockingScript)).toBe(toHex(p2pkhScript));
    expect(toHex(outPoint.LockignScript)).toBe(toHex(p2pkhScript));

    const next = fromHex("76a9146b7f6a5d5677d1f3635e589b2eacc75d08dc6c4588ac");
    outPoint.LockignScript = next;
    expect(toHex(outPoint.LockingScript)).toBe(toHex(next));
  });
});
