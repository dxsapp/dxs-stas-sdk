import { getMinimumRequiredByte, getNumberBytes } from "../src/buffer/buffer-utils";

describe("buffer utils numeric safety", () => {
  test("computes minimum signed byte size for safe integer boundaries", () => {
    expect(getMinimumRequiredByte(127)).toBe(1);
    expect(getMinimumRequiredByte(128)).toBe(2);
    expect(getMinimumRequiredByte(32767)).toBe(2);
    expect(getMinimumRequiredByte(32768)).toBe(3);
    expect(getMinimumRequiredByte(Number.MAX_SAFE_INTEGER)).toBe(7);
    expect(getMinimumRequiredByte(-Number.MAX_SAFE_INTEGER)).toBe(7);
  });

  test("rejects unsafe integers", () => {
    expect(() => getMinimumRequiredByte(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      "Number.MAX_SAFE_INTEGER",
    );
    expect(() => getNumberBytes(Number.MIN_SAFE_INTEGER - 1)).toThrow(
      "Number.MAX_SAFE_INTEGER",
    );
  });
});
