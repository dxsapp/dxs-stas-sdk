import { fromHex, toHex } from "../src/bytes";
import {
  DstasActionKind,
  DstasSwapActionData,
  buildDstasLockingScript,
  buildSwapActionData,
  computeDstasRequestedScriptHash,
  extractDstasCounterpartyScript,
  decodeActionData,
  encodeActionData,
} from "../src/script";

describe("dstas action data", () => {
  test("encodes and decodes single swap leg", () => {
    const requestedScriptHash = fromHex("11".repeat(32));
    const requestedPkh = fromHex("22".repeat(20));

    const encoded = buildSwapActionData({
      requestedScriptHash,
      requestedPkh,
      rateNumerator: 2,
      rateDenominator: 5,
    });

    expect(encoded.length).toBe(61);
    expect(encoded[0]).toBe(DstasActionKind.swap);

    const parsed = decodeActionData(encoded);
    expect(parsed.kind).toBe("swap");
    if (parsed.kind !== "swap") return;

    expect(toHex(parsed.requestedScriptHash)).toBe(toHex(requestedScriptHash));
    expect(toHex(parsed.requestedPkh)).toBe(toHex(requestedPkh));
    expect(parsed.rateNumerator).toBe(2);
    expect(parsed.rateDenominator).toBe(5);
    expect(parsed.next).toBeUndefined();
  });

  test("encodes and decodes recursive swap legs", () => {
    const encoded = buildSwapActionData({
      requestedScriptHash: fromHex("33".repeat(32)),
      requestedPkh: fromHex("44".repeat(20)),
      rateNumerator: 7,
      rateDenominator: 9,
      next: {
        kind: "swap",
        requestedScriptHash: fromHex("55".repeat(32)),
        requestedPkh: fromHex("66".repeat(20)),
        rateNumerator: 11,
        rateDenominator: 13,
      },
    });

    const parsed = decodeActionData(encoded);
    expect(parsed.kind).toBe("swap");
    if (parsed.kind !== "swap") return;
    expect(parsed.next?.kind).toBe("swap");
    if (!parsed.next || parsed.next.kind !== "swap") return;
    expect(parsed.next.rateNumerator).toBe(11);
    expect(parsed.next.rateDenominator).toBe(13);
  });

  test("encodes and decodes long swap chain without recursion overflow", () => {
    const legsCount = 250;
    let chain: DstasSwapActionData = {
      kind: "swap",
      requestedScriptHash: fromHex("aa".repeat(32)),
      requestedPkh: fromHex("bb".repeat(20)),
      rateNumerator: 1,
      rateDenominator: 2,
    };

    for (let i = legsCount; i >= 2; i--) {
      chain = {
        kind: "swap",
        requestedScriptHash: fromHex((i % 2 === 0 ? "cc" : "dd").repeat(32)),
        requestedPkh: fromHex((i % 2 === 0 ? "ee" : "ff").repeat(20)),
        rateNumerator: i,
        rateDenominator: i + 1,
        next: chain,
      };
    }

    const encoded = buildSwapActionData(chain);
    expect(encoded.length).toBe(61 * legsCount);

    const parsed = decodeActionData(encoded);
    expect(parsed.kind).toBe("swap");
    if (parsed.kind !== "swap") return;

    let count = 0;
    let cursor: DstasSwapActionData | undefined = parsed;
    while (cursor) {
      count++;
      cursor = cursor.next;
    }

    expect(count).toBe(legsCount);
  });

  test("rejects cyclic swap chain", () => {
    const cyclic: DstasSwapActionData = {
      kind: "swap",
      requestedScriptHash: fromHex("11".repeat(32)),
      requestedPkh: fromHex("22".repeat(20)),
      rateNumerator: 1,
      rateDenominator: 1,
    };
    cyclic.next = cyclic;

    expect(() => buildSwapActionData(cyclic)).toThrow("cyclic next reference");
  });

  test("rejects zero rateDenominator in swap leg", () => {
    expect(() =>
      buildSwapActionData({
        requestedScriptHash: fromHex("11".repeat(32)),
        requestedPkh: fromHex("22".repeat(20)),
        rateNumerator: 1,
        rateDenominator: 0,
      }),
    ).toThrow("rateDenominator must be > 0 when rateNumerator is non-zero");
  });

  test("encodes action action data", () => {
    const encoded = encodeActionData({
      kind: "action",
      action: DstasActionKind.freeze,
      payload: fromHex("aa55"),
    });

    expect(toHex(encoded)).toBe("03aa55");
    const parsed = decodeActionData(encoded);
    expect(parsed.kind).toBe("action");
    if (parsed.kind !== "action") return;
    expect(parsed.action).toBe(DstasActionKind.freeze);
    expect(toHex(parsed.payload ?? new Uint8Array(0))).toBe("aa55");
  });

  test("rejects truncated swap leg", () => {
    const truncated = fromHex("01" + "11".repeat(16));
    expect(() => decodeActionData(truncated)).toThrow(
      "swap action data is truncated",
    );
  });

  test("rejects swap payload with trailing garbage", () => {
    const valid = buildSwapActionData({
      requestedScriptHash: fromHex("11".repeat(32)),
      requestedPkh: fromHex("22".repeat(20)),
      rateNumerator: 1,
      rateDenominator: 1,
    });
    const malformed = new Uint8Array(valid.length + 1);
    malformed.set(valid);
    malformed[malformed.length - 1] = DstasActionKind.freeze;

    expect(() => decodeActionData(malformed)).toThrow(
      "swap action data is truncated",
    );
  });

  test("rejects truncated second swap leg boundary", () => {
    const valid = buildSwapActionData({
      requestedScriptHash: fromHex("11".repeat(32)),
      requestedPkh: fromHex("22".repeat(20)),
      rateNumerator: 1,
      rateDenominator: 1,
      next: {
        kind: "swap",
        requestedScriptHash: fromHex("33".repeat(32)),
        requestedPkh: fromHex("44".repeat(20)),
        rateNumerator: 2,
        rateDenominator: 3,
      },
    });
    const malformed = valid.subarray(0, valid.length - 7);

    expect(() => decodeActionData(malformed)).toThrow(
      "swap action data is truncated",
    );
  });

  test("preserves unknown action kind as opaque payload", () => {
    const parsed = decodeActionData(fromHex("7faa55"));
    expect(parsed.kind).toBe("unknown");
    if (parsed.kind !== "unknown") return;
    expect(parsed.action).toBe(0x7f);
    expect(toHex(parsed.payload)).toBe("aa55");
  });

  test("requestedScriptHash ignores second field length and hashes the parsed tail", () => {
    const short = buildDstasLockingScript({
      ownerPkh: fromHex("11".repeat(20)),
      actionData: fromHex("aa"),
      redemptionPkh: fromHex("22".repeat(20)),
      flags: new Uint8Array([0x00]),
    });
    const long = buildDstasLockingScript({
      ownerPkh: fromHex("11".repeat(20)),
      actionData: fromHex("aa55aa55aa"),
      redemptionPkh: fromHex("22".repeat(20)),
      flags: new Uint8Array([0x00]),
    });

    const shortTail = extractDstasCounterpartyScript(short);
    const longTail = extractDstasCounterpartyScript(long);

    expect(toHex(shortTail)).toBe(toHex(longTail));
    expect(
      toHex(computeDstasRequestedScriptHash(short)),
    ).toBe(toHex(computeDstasRequestedScriptHash(long)));
  });
});
