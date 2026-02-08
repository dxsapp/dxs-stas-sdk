import { evaluateScripts } from "../../src/script";
import { ScriptReader } from "../../src/script";
import { ScriptBuilder } from "../../src/script";
import { ScriptToken } from "../../src/script/script-token";
import { ScriptType } from "../../src/bitcoin/script-type";
import { TransactionReader } from "../../src/transaction/read/transaction-reader";
import {
  buildTransferFromFixture,
  createRealFundingFlowFixture,
} from "../helpers/stas30-flow-helpers";

const toHex = (b?: Uint8Array) => (b ? Buffer.from(b).toString("hex") : "");

describe("stas30 with-change probe", () => {
  test("probe unlocking variants", () => {
    const f = createRealFundingFlowFixture();
    const txHex = buildTransferFromFixture(f, false);
    const tx = TransactionReader.readHex(txHex);

    const cloneTokens = (tokens: ScriptToken[]) =>
      tokens.map((t) => ScriptToken.fromScriptToken(t));
    const setTokenData = (token: ScriptToken, data: Uint8Array) => {
      token.Data = data;
      token.DataLength = data.length;
      token.OpCodeNum =
        data.length < 76
          ? data.length
          : data.length <= 255
            ? 76
            : data.length <= 65535
              ? 77
              : 78;
    };

    const baseTokens = ScriptReader.read(tx.Inputs[0].UnlockingScript);

    const show = baseTokens.slice(0, 12).map((t, i) => ({
      i,
      op: t.OpCodeNum,
      data: t.Data ? toHex(t.Data) : null,
    }));
    // eslint-disable-next-line no-console
    console.log("base first tokens", show);

    const evalVariant = (name: string, tokens: ScriptToken[]) => {
      const unlocking = ScriptBuilder.fromTokens(
        tokens,
        ScriptType.unknown,
      ).toBytes();
      const r = evaluateScripts(
        unlocking,
        f.issueTx.Outputs[0].LockignScript,
        {
          tx,
          inputIndex: 0,
          prevOutputs: [
            {
              lockingScript: f.issueTx.Outputs[0].LockignScript,
              satoshis: f.issueTx.Outputs[0].Satoshis,
            },
            {
              lockingScript: f.issueTx.Outputs[1].LockignScript,
              satoshis: f.issueTx.Outputs[1].Satoshis,
            },
          ],
        },
        { allowOpReturn: true, trace: false },
      );
      // eslint-disable-next-line no-console
      console.log(name, r.success, r.error);
    };

    evalVariant("base", baseTokens);
    const fundingVoutIdx = baseTokens.length - 7;
    const fundingTxIdIdx = baseTokens.length - 6;
    expect(baseTokens[fundingTxIdIdx]?.Data?.length).toBe(32);

    const t1 = cloneTokens(baseTokens);
    if (t1[2]?.Data) setTokenData(t1[2], Uint8Array.from([0x39, 0x03]));
    evalVariant("amount2=3903", t1);

    const t2 = cloneTokens(baseTokens);
    if (t2[2]?.Data)
      setTokenData(t2[2], Uint8Array.from([0x39, 0x03, 0, 0, 0, 0, 0, 0]));
    evalVariant("amount2=8byte-le", t2);

    const t3 = cloneTokens(baseTokens);
    if (t3[2]?.Data)
      setTokenData(t3[2], Uint8Array.from([0, 0, 0, 0, 0, 0, 0x03, 0x39]));
    evalVariant("amount2=8byte-be", t3);

    const t4 = cloneTokens(baseTokens);
    const op0Template = baseTokens.find((t) => t.OpCodeNum === 0);
    if (op0Template)
      t4.splice(fundingVoutIdx, 0, ScriptToken.fromScriptToken(op0Template));
    evalVariant("insert-empty-note", t4);

    const t5 = cloneTokens(baseTokens);
    const a0 = t5[0];
    const p0 = t5[1];
    const a1 = t5[2];
    const p1 = t5[3];
    t5[0] = a1;
    t5[1] = p1;
    t5[2] = a0;
    t5[3] = p0;
    evalVariant("swap-output-pairs", t5);

    const t6 = cloneTokens(baseTokens);
    t6.splice(2, 2);
    evalVariant("remove-change-pair", t6);

    const t7 = cloneTokens(baseTokens);
    const emptyNoteIdx = (() => {
      for (let i = fundingVoutIdx - 1; i >= 0; i--) {
        if (t7[i].OpCodeNum === 0 && !t7[i].Data) return i;
      }
      return -1;
    })();
    if (emptyNoteIdx >= 0) t7.splice(emptyNoteIdx, 1);
    evalVariant("remove-empty-note-only", t7);

    expect(true).toBe(true);
  });
});
