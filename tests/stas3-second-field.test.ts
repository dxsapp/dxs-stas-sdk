import { fromHex, toHex } from "../src/bytes";
import {
  Stas3SecondFieldAction,
  buildStas3SwapSecondField,
  decodeStas3SecondField,
  encodeStas3SecondField,
} from "../src/script";

describe("stas3 second field", () => {
  test("encodes and decodes single swap leg", () => {
    const requestedScriptHash = fromHex("11".repeat(32));
    const requestedPkh = fromHex("22".repeat(20));

    const encoded = buildStas3SwapSecondField({
      requestedScriptHash,
      requestedPkh,
      rateNumerator: 2,
      rateDenominator: 5,
    });

    expect(encoded.length).toBe(61);
    expect(encoded[0]).toBe(Stas3SecondFieldAction.swap);

    const parsed = decodeStas3SecondField(encoded);
    expect(parsed.kind).toBe("swap");
    if (parsed.kind !== "swap") return;

    expect(toHex(parsed.requestedScriptHash)).toBe(toHex(requestedScriptHash));
    expect(toHex(parsed.requestedPkh)).toBe(toHex(requestedPkh));
    expect(parsed.rateNumerator).toBe(2);
    expect(parsed.rateDenominator).toBe(5);
    expect(parsed.next).toBeUndefined();
  });

  test("encodes and decodes recursive swap legs", () => {
    const encoded = buildStas3SwapSecondField({
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

    const parsed = decodeStas3SecondField(encoded);
    expect(parsed.kind).toBe("swap");
    if (parsed.kind !== "swap") return;
    expect(parsed.next?.kind).toBe("swap");
    if (!parsed.next || parsed.next.kind !== "swap") return;
    expect(parsed.next.rateNumerator).toBe(11);
    expect(parsed.next.rateDenominator).toBe(13);
  });

  test("encodes action second field", () => {
    const encoded = encodeStas3SecondField({
      kind: "action",
      action: Stas3SecondFieldAction.freeze,
      payload: fromHex("aa55"),
    });

    expect(toHex(encoded)).toBe("03aa55");
    const parsed = decodeStas3SecondField(encoded);
    expect(parsed.kind).toBe("action");
    if (parsed.kind !== "action") return;
    expect(parsed.action).toBe(Stas3SecondFieldAction.freeze);
    expect(toHex(parsed.payload ?? new Uint8Array(0))).toBe("aa55");
  });
});
