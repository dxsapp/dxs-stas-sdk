import {
  bytesToUtf8,
  concat,
  equal,
  fromHex,
  toHex,
  utf8ToBytes,
} from "../src/bytes";

describe("bytes utilities", () => {
  test("utf8 round-trip", () => {
    const message = "dxs test";
    const bytes = utf8ToBytes(message);

    expect(bytesToUtf8(bytes)).toBe(message);
  });

  test("hex round-trip and odd length", () => {
    const hex = "deadbeef";
    const bytes = fromHex(hex);

    expect(toHex(bytes)).toBe(hex);

    const odd = fromHex("abc");
    expect(toHex(odd)).toBe("0abc");
  });

  test("concat and equal", () => {
    const a = fromHex("01ff");
    const b = fromHex("0203");
    const merged = concat([a, b]);

    expect(toHex(merged)).toBe("01ff0203");
    expect(equal(merged, fromHex("01ff0203"))).toBe(true);
    expect(equal(merged, a)).toBe(false);
  });

  test("fromHex rejects invalid input", () => {
    expect(() => fromHex("zz")).toThrow("Invalid hex string");
  });
});
