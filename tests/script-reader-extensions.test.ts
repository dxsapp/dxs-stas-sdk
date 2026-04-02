import { ScriptType } from "../src/bitcoin/script-type";
import { LockingScriptReader } from "../src/script/read/locking-script-reader";
import { isSplittable } from "../src/script/read/script-reader-extensions";
import { fromHex } from "../src/bytes";

describe("script reader extensions", () => {
  test("defaults to splittable for non-p2stas scripts", () => {
    const reader = LockingScriptReader.read(fromHex("51"));
    expect(isSplittable(reader)).toBe(true);
  });

  test("interprets second STAS data item as splittable marker", () => {
    const splittable = {
      ScriptType: ScriptType.p2stas,
      Data: [fromHex("aa"), fromHex("00")],
    } as unknown as LockingScriptReader;
    const notSplittable = {
      ScriptType: ScriptType.p2stas,
      Data: [fromHex("aa"), fromHex("01")],
    } as unknown as LockingScriptReader;

    expect(isSplittable(splittable)).toBe(true);
    expect(isSplittable(notSplittable)).toBe(false);
  });
});
