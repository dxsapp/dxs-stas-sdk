import { ScriptBuilder } from "../src/script/build/script-builder";
import { ScriptReader } from "../src/script/read/script-reader";
import { ScriptType } from "../src/bitcoin/script-type";
import { OpCode } from "../src/bitcoin/op-codes";
import { fromHex } from "../src/bytes";

describe("script build/read round-trip", () => {
  test("round-trips mixed data pushes", () => {
    const short = new Uint8Array([1, 2, 3]);
    const long = new Uint8Array(80);
    for (let i = 0; i < long.length; i++) long[i] = i;

    const builder = new ScriptBuilder(ScriptType.p2pkh)
      .addOpCode(OpCode.OP_DUP)
      .addData(short)
      .addData(long)
      .addNumber(0)
      .addNumber(5)
      .addOpCode(OpCode.OP_CHECKSIG);

    const hex = builder.toHex();
    const tokens = ScriptReader.read(fromHex(hex));
    const rebuilt = ScriptBuilder.fromTokens(tokens, ScriptType.p2pkh).toHex();

    expect(rebuilt).toBe(hex);
    expect(tokens.length).toBe(6);
    expect(tokens[1].Data?.length).toBe(3);
    expect(tokens[2].Data?.length).toBe(80);
  });
});
