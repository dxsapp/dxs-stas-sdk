import { OpCode } from "../src/bitcoin/op-codes";
import { fromHex, toHex } from "../src/bytes";
import {
  configureStrictMode,
  resetStrictMode,
} from "../src/security/strict-mode";
import { BaseScriptReader } from "../src/script/read/base-script-reader";
import { ScriptReadToken } from "../src/script/read/script-read-token";

class ProbeScriptReader extends BaseScriptReader {
  Tokens: ScriptReadToken[] = [];

  read() {
    return this.readInternal();
  }

  protected handleToken(token: ScriptReadToken): boolean {
    this.Tokens.push(token);
    return true;
  }
}

describe("base script reader edge cases", () => {
  afterEach(() => {
    resetStrictMode();
  });

  test("throws on malformed pushdata in strict mode", () => {
    const reader = new ProbeScriptReader(fromHex("4c05aabb"));
    expect(() => reader.read()).toThrow("Malformed pushdata in script");
  });

  test("preserves malformed push tail as synthetic token in permissive mode", () => {
    configureStrictMode({ strictScriptReader: false });
    const reader = new ProbeScriptReader(fromHex("4c05aabb"));

    expect(reader.read()).toBe(1);
    expect(reader.Tokens).toHaveLength(1);
    expect(reader.Tokens[0].OpCodeNum).toBe(OpCode.OP_PUSHDATA1);
    expect(toHex(reader.Tokens[0].Data)).toBe("4c05aabb");
  });

  test("preserves unterminated pushdata header remainder in permissive mode", () => {
    configureStrictMode({ strictScriptReader: false });
    const reader = new ProbeScriptReader(fromHex("4d01"));

    expect(reader.read()).toBe(1);
    expect(reader.Tokens).toHaveLength(1);
    expect(reader.Tokens[0].OpCodeNum).toBe(OpCode.OP_PUSHDATA2);
    expect(toHex(reader.Tokens[0].Data)).toBe("01");
  });
});
