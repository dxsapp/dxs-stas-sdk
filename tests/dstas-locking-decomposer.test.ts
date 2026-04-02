import { fromHex, toHex, utf8ToBytes } from "../src/bytes";
import { OpCode } from "../src/bitcoin/op-codes";
import { ScriptType } from "../src/bitcoin/script-type";
import { buildSwapActionData } from "../src/script/dstas-action-data";
import { buildDstasLockingScript } from "../src/script/build/dstas-locking-builder";
import { ScriptBuilder } from "../src/script/build/script-builder";
import { ScriptToken } from "../src/script/script-token";
import { buildDstasTemplateBaseTokens } from "../src/script/templates/dstas-locking-template-base";
import { decomposeDstasLockingScript } from "../src/script/read/dstas-locking-script-decomposer";

describe("dstas locking script decomposer", () => {
  const owner = fromHex("11".repeat(20));
  const redemption = fromHex("22".repeat(20));
  const freezeAuthority = fromHex("33".repeat(20));
  const confiscationAuthority = fromHex("44".repeat(20));
  const optionalA = utf8ToBytes("note");
  const optionalB = fromHex("abcd");
  const baseScript = ScriptBuilder.fromTokens(
    buildDstasTemplateBaseTokens(),
    ScriptType.unknown,
  ).toBytes();

  const push = (value: Uint8Array) =>
    ScriptBuilder.fromTokens(
      [ScriptToken.fromBytes(value)],
      ScriptType.unknown,
    ).toBytes();

  const buildManualDstasScript = (params: {
    owner: Uint8Array;
    actionData: Uint8Array;
    redemption: Uint8Array;
    flags: Uint8Array;
    serviceFields?: Uint8Array[];
    optionalData?: Uint8Array[];
  }) =>
    new Uint8Array([
      ...push(params.owner),
      ...push(params.actionData),
      ...baseScript,
      ...push(params.redemption),
      ...push(params.flags),
      ...(params.serviceFields ?? []).flatMap((value) => [...push(value)]),
      ...(params.optionalData ?? []).flatMap((value) => [...push(value)]),
    ]);

  test("decomposes owner, opcode action data, flags, service fields, and optional data", () => {
    const script = buildDstasLockingScript({
      ownerPkh: owner,
      actionData: null,
      redemptionPkh: redemption,
      flags: new Uint8Array([0x03]),
      serviceFields: [freezeAuthority, confiscationAuthority],
      optionalData: [optionalA, optionalB],
    });

    const parts = decomposeDstasLockingScript(script);

    expect(parts.baseMatched).toBe(true);
    expect(parts.ownerHex).toBe(toHex(owner));
    expect(parts.ownerPkhHex).toBe(toHex(owner));
    expect(parts.actionData).toEqual({ kind: "opcode", opcode: OpCode.OP_0 });
    expect(parts.redemptionPkhHex).toBe(toHex(redemption));
    expect(parts.flagsHex).toBe("03");
    expect(parts.freezeEnabled).toBe(true);
    expect(parts.confiscationEnabled).toBe(true);
    expect(parts.serviceFieldHexes).toEqual([
      toHex(freezeAuthority),
      toHex(confiscationAuthority),
    ]);
    expect(parts.optionalDataHexes).toEqual([
      toHex(optionalA),
      toHex(optionalB),
    ]);
    expect(parts.errors).toEqual([]);
  });

  test("parses swap action data as raw data field", () => {
    const script = buildDstasLockingScript({
      ownerPkh: owner,
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

  test("parses large pushdata owner and action data chunks", () => {
    const script = buildManualDstasScript({
      owner: new Uint8Array(76).fill(0x11),
      actionData: new Uint8Array(256).fill(0x22),
      redemption,
      flags: new Uint8Array([0x00]),
    });

    const parts = decomposeDstasLockingScript(script);

    expect(parts.baseMatched).toBe(true);
    expect(parts.ownerHex).toHaveLength(152);
    expect(parts.actionData?.kind).toBe("data");
    if (parts.actionData?.kind !== "data") return;
    expect(parts.actionData.hex).toHaveLength(512);
    expect(parts.redemptionPkhHex).toBe(toHex(redemption));
  });

  test("parses an OP_PUSHDATA4 owner chunk", () => {
    const script = buildManualDstasScript({
      owner: new Uint8Array(65536).fill(0x33),
      actionData: fromHex("44"),
      redemption,
      flags: new Uint8Array([0x00]),
    });

    const parts = decomposeDstasLockingScript(script);

    expect(parts.baseMatched).toBe(true);
    expect(parts.ownerHex).toHaveLength(131072);
    expect(parts.actionData?.kind).toBe("data");
    if (parts.actionData?.kind !== "data") return;
    expect(parts.actionData.hex).toBe("44");
  });

  test("returns owner-field error when script does not start with pushdata", () => {
    const parts = decomposeDstasLockingScript(fromHex("51"));

    expect(parts.baseMatched).toBe(false);
    expect(parts.errors).toContain(
      "owner field pushdata was not found at script start",
    );
  });

  test("reports missing action data when the second chunk is absent", () => {
    const parts = decomposeDstasLockingScript(fromHex("14" + "11".repeat(20)));

    expect(parts.errors).toContain("action data was not found");
    expect(parts.baseMatched).toBe(false);
  });

  test("reports scripts shorter than the DSTAS template base", () => {
    const script = buildDstasLockingScript({
      ownerPkh: owner,
      actionData: null,
      redemptionPkh: redemption,
      flags: new Uint8Array([0x00]),
    });
    const truncated = script.subarray(0, 22);

    const parts = decomposeDstasLockingScript(truncated);

    expect(parts.errors).toContain(
      "script is shorter than DSTAS template base",
    );
    expect(parts.baseMatched).toBe(false);
  });

  test("reports a base mismatch when the template body is corrupted", () => {
    const script = buildDstasLockingScript({
      ownerPkh: owner,
      actionData: null,
      redemptionPkh: redemption,
      flags: new Uint8Array([0x00]),
    });
    const mutated = new Uint8Array(script);
    mutated[22] ^= 0x01;

    const parts = decomposeDstasLockingScript(mutated);

    expect(parts.errors).toContain(
      "script middle does not match DSTAS template base",
    );
    expect(parts.baseMatched).toBe(false);
  });

  test("reports invalid redemption field length", () => {
    const script = buildDstasLockingScript({
      ownerPkh: owner,
      actionData: null,
      redemptionPkh: redemption,
      flags: new Uint8Array([0x00]),
    });
    const mutated = new Uint8Array(script);
    mutated[script.length - 23] = 0x13;

    const parts = decomposeDstasLockingScript(mutated);

    expect(parts.errors).toContain("redemption PKH pushdata(20) was not found");
  });

  test("reports failed tail chunk parsing when optional data is truncated", () => {
    const script = buildDstasLockingScript({
      ownerPkh: owner,
      actionData: null,
      redemptionPkh: redemption,
      flags: new Uint8Array([0x00]),
      optionalData: [fromHex("aabb")],
    });
    const truncated = script.subarray(0, script.length - 1);

    const parts = decomposeDstasLockingScript(truncated);

    expect(parts.errors).toContain("failed to parse tail chunk");
    expect(parts.optionalDataHexes).toEqual([]);
  });

  test("treats OP_0 flags as disabled and collects no service fields", () => {
    const script = buildDstasLockingScript({
      ownerPkh: owner,
      actionData: null,
      redemptionPkh: redemption,
      flags: new Uint8Array([0x00]),
    });
    const op0Script = new Uint8Array([
      ...script.subarray(0, script.length - 2),
      OpCode.OP_0,
    ]);

    const parts = decomposeDstasLockingScript(op0Script);

    expect(parts.flagsHex).toBe("");
    expect(parts.freezeEnabled).toBe(false);
    expect(parts.confiscationEnabled).toBe(false);
    expect(parts.serviceFieldHexes).toEqual([]);
    expect(parts.optionalDataHexes).toEqual([]);
    expect(parts.errors).toEqual([]);
  });

  test("parses freeze-only pushdata flags with one service field", () => {
    const script = buildDstasLockingScript({
      ownerPkh: owner,
      actionData: null,
      redemptionPkh: redemption,
      flags: new Uint8Array([0x01]),
      serviceFields: [freezeAuthority],
    });

    const parts = decomposeDstasLockingScript(script);

    expect(parts.flagsHex).toBe("01");
    expect(parts.freezeEnabled).toBe(true);
    expect(parts.confiscationEnabled).toBe(false);
    expect(parts.serviceFieldHexes).toEqual([toHex(freezeAuthority)]);
  });

  test("parses confiscation-only pushdata flags with one service field", () => {
    const script = buildDstasLockingScript({
      ownerPkh: owner,
      actionData: null,
      redemptionPkh: redemption,
      flags: new Uint8Array([0x02]),
      serviceFields: [confiscationAuthority],
    });

    const parts = decomposeDstasLockingScript(script);

    expect(parts.flagsHex).toBe("02");
    expect(parts.freezeEnabled).toBe(false);
    expect(parts.confiscationEnabled).toBe(true);
    expect(parts.serviceFieldHexes).toEqual([toHex(confiscationAuthority)]);
  });

  test("keeps fewer-than-expected service fields without inventing errors", () => {
    const script = buildDstasLockingScript({
      ownerPkh: owner,
      actionData: null,
      redemptionPkh: redemption,
      flags: new Uint8Array([0x03]),
      serviceFields: [freezeAuthority, confiscationAuthority],
    });
    const truncated = script.subarray(0, script.length - 21);

    const parts = decomposeDstasLockingScript(truncated);

    expect(parts.flagsHex).toBe("03");
    expect(parts.serviceFieldHexes).toEqual([toHex(freezeAuthority)]);
    expect(parts.optionalDataHexes).toEqual([]);
    expect(parts.errors).toEqual([]);
  });

  test("collects extra pushdata chunks into optional data and trailing opcodes", () => {
    const script = buildDstasLockingScript({
      ownerPkh: owner,
      actionData: null,
      redemptionPkh: redemption,
      flags: new Uint8Array([0x03]),
      serviceFields: [freezeAuthority, confiscationAuthority],
      optionalData: [optionalA, optionalB],
    });
    const extended = new Uint8Array([...script, OpCode.OP_1, OpCode.OP_2]);

    const parts = decomposeDstasLockingScript(extended);

    expect(parts.optionalDataHexes).toEqual([
      toHex(optionalA),
      toHex(optionalB),
    ]);
    expect(parts.trailingOpcodes).toEqual([OpCode.OP_1, OpCode.OP_2]);
  });

  test("flags opcode branch is reported as invalid", () => {
    const valid = buildDstasLockingScript({
      ownerPkh: owner,
      actionData: null,
      redemptionPkh: redemption,
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
