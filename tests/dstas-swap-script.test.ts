import { fromHex, toHex, concat } from "../src/bytes";
import { ScriptType } from "../src/bitcoin/script-type";
import { buildDstasLockingScript } from "../src/script/build/dstas-locking-builder";
import { ScriptBuilder } from "../src/script/build/script-builder";
import { ScriptToken } from "../src/script/script-token";
import {
  extractDstasCounterpartyScript,
  splitDstasPreviousTransactionByCounterpartyScript,
} from "../src/script/dstas-swap-script";

const makeFilledBytes = (length: number, value: number): Uint8Array => {
  const out = new Uint8Array(length);
  out.fill(value);
  return out;
};

const buildCounterpartyScript = (
  owner: Uint8Array,
  second: Uint8Array,
  tail: Uint8Array[] = [],
): Uint8Array =>
  ScriptBuilder.fromTokens(
    [owner, second, ...tail].map((chunk) => ScriptToken.fromBytes(chunk)),
    ScriptType.unknown,
  ).toBytes();

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
    expect(toHex(extractDstasCounterpartyScript(short))).not.toBe(toHex(short));
    expect(toHex(extractDstasCounterpartyScript(short))).toBe(
      toHex(extractDstasCounterpartyScript(long)),
    );
  });

  test("extracts tail when owner and action data use pushdata opcodes", () => {
    const owner = makeFilledBytes(76, 0x11);
    const actionData = makeFilledBytes(256, 0x22);
    const tail = fromHex("deadbeef");
    const script = buildCounterpartyScript(owner, actionData, [tail]);
    const expectedTail = ScriptBuilder.fromTokens(
      [tail].map((chunk) => ScriptToken.fromBytes(chunk)),
      ScriptType.unknown,
    ).toBytes();

    expect(toHex(extractDstasCounterpartyScript(script))).toBe(
      toHex(expectedTail),
    );
  });

  test("extracts tail when owner uses OP_PUSHDATA4", () => {
    const owner = makeFilledBytes(65536, 0x33);
    const actionData = fromHex("44");
    const tail = fromHex("cafebabe");
    const script = buildCounterpartyScript(owner, actionData, [tail]);
    const expectedTail = ScriptBuilder.fromTokens(
      [tail].map((chunk) => ScriptToken.fromBytes(chunk)),
      ScriptType.unknown,
    ).toBytes();

    expect(toHex(extractDstasCounterpartyScript(script))).toBe(
      toHex(expectedTail),
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
    ).toThrow("DSTAS locking script must include action data");
  });

  test("rejects malformed owner pushdata", () => {
    expect(() => extractDstasCounterpartyScript(fromHex("4c01"))).toThrow(
      "DSTAS locking script must start with owner field",
    );
  });

  test("rejects malformed action data pushdata", () => {
    const owner = fromHex("11".repeat(20));
    const malformed = concat([fromHex("14"), owner, fromHex("4c01")]);

    expect(() => extractDstasCounterpartyScript(malformed)).toThrow(
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

    const pieces = splitDstasPreviousTransactionByCounterpartyScript(
      tx,
      script,
    );

    expect(pieces).toHaveLength(3);
    expect(toHex(pieces[0])).toBe(toHex(piece0));
    expect(toHex(pieces[1])).toBe(toHex(piece1));
    expect(toHex(pieces[2])).toBe(toHex(piece2));
  });

  test("splits previous transaction at adjacent matches and single-byte needles", () => {
    const script = fromHex("aa");
    const tx = concat([
      makeFilledBytes(128, 0x11),
      script,
      script,
      makeFilledBytes(256, 0x22),
      script,
      makeFilledBytes(64, 0x33),
    ]);

    const pieces = splitDstasPreviousTransactionByCounterpartyScript(
      tx,
      script,
    );

    expect(pieces).toHaveLength(4);
    expect(pieces[0]).toHaveLength(128);
    expect(pieces[1]).toHaveLength(0);
    expect(pieces[2]).toHaveLength(256);
    expect(pieces[3]).toHaveLength(64);
  });

  test("splits previous transaction across large repeated pieces", () => {
    const script = fromHex("abcd");
    const tx = concat([
      makeFilledBytes(1024, 0x41),
      script,
      makeFilledBytes(2048, 0x42),
      script,
      makeFilledBytes(4096, 0x43),
      script,
      makeFilledBytes(512, 0x44),
    ]);

    const pieces = splitDstasPreviousTransactionByCounterpartyScript(
      tx,
      script,
    );

    expect(pieces).toHaveLength(4);
    expect(pieces[0]).toHaveLength(1024);
    expect(pieces[1]).toHaveLength(2048);
    expect(pieces[2]).toHaveLength(4096);
    expect(pieces[3]).toHaveLength(512);
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

    const pieces = splitDstasPreviousTransactionByCounterpartyScript(
      tx,
      script,
    );

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
