import { fromHex, toHex, utf8ToBytes } from "../src/bytes";
import { OpCode } from "../src/bitcoin/op-codes";
import { buildSwapActionData } from "../src/script/dstas-action-data";
import { buildDstasLockingScript } from "../src/script/build/dstas-locking-builder";
import { decomposeDstasLockingScript } from "../src/script/read/dstas-locking-script-decomposer";

describe("dstas locking script decomposer", () => {
  test("decomposes owner, opcode action data, flags, service fields, and optional data", () => {
    const script = buildDstasLockingScript({
      ownerPkh: fromHex("11".repeat(20)),
      actionData: null,
      redemptionPkh: fromHex("22".repeat(20)),
      flags: new Uint8Array([0x03]),
      serviceFields: [fromHex("33".repeat(20)), fromHex("44".repeat(20))],
      optionalData: [utf8ToBytes("note"), fromHex("abcd")],
    });

    const parts = decomposeDstasLockingScript(script);

    expect(parts.baseMatched).toBe(true);
    expect(parts.ownerHex).toBe("11".repeat(20));
    expect(parts.ownerPkhHex).toBe("11".repeat(20));
    expect(parts.actionData).toEqual({ kind: "opcode", opcode: OpCode.OP_0 });
    expect(parts.redemptionPkhHex).toBe("22".repeat(20));
    expect(parts.flagsHex).toBe("03");
    expect(parts.freezeEnabled).toBe(true);
    expect(parts.confiscationEnabled).toBe(true);
    expect(parts.serviceFieldHexes).toEqual([
      "33".repeat(20),
      "44".repeat(20),
    ]);
    expect(parts.optionalDataHexes).toEqual([
      toHex(utf8ToBytes("note")),
      "abcd",
    ]);
    expect(parts.errors).toEqual([]);
  });

  test("parses swap action data as raw data field", () => {
    const script = buildDstasLockingScript({
      ownerPkh: fromHex("11".repeat(20)),
      actionData: buildSwapActionData({
        requestedScriptHash: fromHex("aa".repeat(32)),
        requestedPkh: fromHex("bb".repeat(20)),
        rateNumerator: 7,
        rateDenominator: 9,
      }),
      redemptionPkh: fromHex("22".repeat(20)),
      flags: new Uint8Array([0x00]),
    });

    const parts = decomposeDstasLockingScript(script);

    expect(parts.actionData?.kind).toBe("data");
    if (parts.actionData?.kind !== "data") return;
    expect(parts.actionData.hex).toHaveLength(122);
    expect(parts.baseMatched).toBe(true);
  });

  test("returns owner-field error when script does not start with pushdata", () => {
    const parts = decomposeDstasLockingScript(fromHex("51"));

    expect(parts.baseMatched).toBe(false);
    expect(parts.errors).toContain(
      "owner field pushdata was not found at script start",
    );
  });

  test("flags opcode branch is reported as invalid", () => {
    const valid = buildDstasLockingScript({
      ownerPkh: fromHex("11".repeat(20)),
      actionData: null,
      redemptionPkh: fromHex("22".repeat(20)),
      flags: new Uint8Array([0x00]),
    });
    const mutated = new Uint8Array(valid.length - 1);
    mutated.set(valid.subarray(0, valid.length - 2));
    mutated[mutated.length - 1] = OpCode.OP_1;

    const parts = decomposeDstasLockingScript(mutated);

    expect(parts.errors).toContain("flags field is not pushdata/OP_0");
    expect(parts.trailingOpcodes).toContain(OpCode.OP_1);
  });
});
