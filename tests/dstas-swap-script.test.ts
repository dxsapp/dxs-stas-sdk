import { fromHex, toHex } from "../src/bytes";
import { buildDstasLockingScript } from "../src/script/build/dstas-locking-builder";
import {
  extractDstasCounterpartyScript,
  splitDstasPreviousTransactionByCounterpartyScript,
} from "../src/script/dstas-swap-script";

describe("dstas swap script helpers", () => {
  test("extracts parsed tail after variable-length action data", () => {
    const short = buildDstasLockingScript({
      ownerPkh: fromHex("11".repeat(20)),
      actionData: fromHex("aa"),
      redemptionPkh: fromHex("22".repeat(20)),
      flags: new Uint8Array([0x00]),
    });
    const long = buildDstasLockingScript({
      ownerPkh: fromHex("11".repeat(20)),
      actionData: fromHex("aa55aa55aa55aa55"),
      redemptionPkh: fromHex("22".repeat(20)),
      flags: new Uint8Array([0x00]),
    });

    expect(toHex(extractDstasCounterpartyScript(short))).not.toBe("");
    expect(toHex(extractDstasCounterpartyScript(short))).not.toBe(
      toHex(short),
    );
    expect(toHex(extractDstasCounterpartyScript(short))).toBe(
      toHex(extractDstasCounterpartyScript(long)),
    );
  });

  test("rejects locking script without owner pushdata", () => {
    expect(() => extractDstasCounterpartyScript(fromHex("51"))).toThrow(
      "DSTAS locking script must start with owner field",
    );
  });

  test("rejects locking script without action data field", () => {
    expect(() =>
      extractDstasCounterpartyScript(fromHex("14" + "11".repeat(20))),
    ).toThrow(
      "DSTAS locking script must include action data",
    );
  });

  test("splits previous transaction by repeated counterparty script occurrences", () => {
    const piece0 = fromHex("aaaa");
    const piece1 = fromHex("bbbbcc");
    const piece2 = fromHex("dd");
    const script = fromHex("1234");
    const tx = new Uint8Array([
      ...piece0,
      ...script,
      ...piece1,
      ...script,
      ...piece2,
    ]);

    const pieces = splitDstasPreviousTransactionByCounterpartyScript(tx, script);

    expect(pieces).toHaveLength(3);
    expect(toHex(pieces[0])).toBe(toHex(piece0));
    expect(toHex(pieces[1])).toBe(toHex(piece1));
    expect(toHex(pieces[2])).toBe(toHex(piece2));
  });

  test("returns full transaction as one piece when script is absent", () => {
    const tx = fromHex("aabbccdd");
    const pieces = splitDstasPreviousTransactionByCounterpartyScript(
      tx,
      fromHex("1122"),
    );

    expect(pieces).toHaveLength(1);
    expect(toHex(pieces[0])).toBe(toHex(tx));
  });

  test("keeps empty boundary pieces when script appears at both edges", () => {
    const script = fromHex("a1b2");
    const tx = new Uint8Array([...script, 0x55, ...script]);

    const pieces = splitDstasPreviousTransactionByCounterpartyScript(tx, script);

    expect(pieces).toHaveLength(3);
    expect(pieces[0]).toHaveLength(0);
    expect(toHex(pieces[1])).toBe("55");
    expect(pieces[2]).toHaveLength(0);
  });

  test("rejects empty counterparty script", () => {
    expect(() =>
      splitDstasPreviousTransactionByCounterpartyScript(
        fromHex("aabb"),
        new Uint8Array(0),
      ),
    ).toThrow("counterpartyScript must not be empty");
  });
});
