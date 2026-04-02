import { toHex } from "../src/bytes";
import { OpCode } from "../src/bitcoin/op-codes";
import {
  asmToBytes,
  asmToTokens,
} from "../src/script/build/asm-template-builder";

describe("asm template builder", () => {
  test("parses opcode aliases and hex payloads", () => {
    const tokens = asmToTokens("OP_TRUE aabb OP_FALSE OP_DUP");

    expect(tokens.map((x) => x.OpCodeNum)).toEqual([
      OpCode.OP_1,
      2,
      OpCode.OP_0,
      OpCode.OP_DUP,
    ]);
    expect(toHex(tokens[1].Data!)).toBe("aabb");
  });

  test("builds bytes from asm tokens", () => {
    expect(toHex(asmToBytes("OP_DUP aabb OP_EQUALVERIFY OP_CHECKSIG"))).toBe(
      "7602aabb88ac",
    );
  });

  test("rejects unresolved placeholders", () => {
    expect(() => asmToTokens("<OWNER_PKH> OP_DUP")).toThrow(
      "Unresolved template placeholder: <OWNER_PKH>",
    );
  });

  test("rejects unknown opcode tokens", () => {
    expect(() => asmToTokens("OP_NOT_REAL")).toThrow(
      "Unknown opcode token: OP_NOT_REAL",
    );
  });

  test("rejects invalid non-hex asm tokens", () => {
    expect(() => asmToTokens("hello")).toThrow("Invalid ASM token: hello");
  });
});
