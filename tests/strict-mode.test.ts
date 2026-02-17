import {
  configureStrictMode,
  resetStrictMode,
} from "../src/security/strict-mode";
import { TransactionReader } from "../src/transaction/read/transaction-reader";
import { TransferNoNoteRaw } from "./stas-transactios";
import { TransactionBuilder } from "../src/transaction/build/transaction-builder";
import { Address } from "../src/bitcoin/address";
import { OutPoint } from "../src/bitcoin/out-point";
import { PrivateKey } from "../src/bitcoin/private-key";
import { ScriptType } from "../src/bitcoin/script-type";
import { OpCode } from "../src/bitcoin/op-codes";
import { fromHex, toHex } from "../src/bytes";
import { ScriptReader } from "../src/script/read/script-reader";
import { BuildDstasIssueTxs } from "../src/dstas-factory";
import { TokenScheme } from "../src/bitcoin/token-scheme";
import { evaluateScripts } from "../src/script/eval/script-evaluator";

const issuerPrivateKey = new PrivateKey(
  fromHex("b62fd57a07804f79291317261054eb9b19c9ccec49146c38b30a29d48636c368"),
);

const p2pkhScript = (address: Address) =>
  fromHex(`76a914${toHex(address.Hash160)}88ac`);

describe("strict mode hardening", () => {
  afterEach(() => {
    resetStrictMode();
  });

  test("strictTxParse rejects trailing bytes after locktime", () => {
    const txWithTail = `${TransferNoNoteRaw}00`;

    expect(() => TransactionReader.readHex(txWithTail)).toThrow(
      "Unexpected trailing bytes after locktime",
    );

    configureStrictMode({ strictTxParse: false });
    expect(() => TransactionReader.readHex(txWithTail)).not.toThrow();
  });

  test("strictFeeRateValidation rejects invalid fee rates", () => {
    const from = issuerPrivateKey.Address;
    const outPoint = new OutPoint(
      "11".repeat(32),
      0,
      p2pkhScript(from),
      5000,
      from,
      ScriptType.p2pkh,
    );

    configureStrictMode({ strictFeeRateValidation: true });

    expect(() =>
      TransactionBuilder.init()
        .addInput(outPoint, issuerPrivateKey)
        .addP2PkhOutput(1000, from)
        .addChangeOutputWithFee(from, 4000, Number.NaN),
    ).toThrow("Invalid fee rate");
  });

  test("strictPresetUnlockingScript requires explicit opt-in", () => {
    const from = issuerPrivateKey.Address;
    const outPoint = new OutPoint(
      "22".repeat(32),
      0,
      p2pkhScript(from),
      5000,
      from,
      ScriptType.p2pkh,
    );

    const txBuilder = TransactionBuilder.init()
      .addInput(outPoint, issuerPrivateKey)
      .addP2PkhOutput(1000, from);

    txBuilder.Inputs[0].UnlockingScript = new Uint8Array([OpCode.OP_0]);

    configureStrictMode({ strictPresetUnlockingScript: true });
    expect(() => txBuilder.sign()).toThrow(
      "Preset unlocking script is disabled in strict mode for this input",
    );

    txBuilder.Inputs[0].AllowPresetUnlockingScript = true;
    expect(() => txBuilder.sign()).not.toThrow();
  });

  test("strictScriptReader throws on malformed pushdata", () => {
    const malformed = new Uint8Array([OpCode.OP_PUSHDATA1, 0x02, 0xaa]);

    expect(ScriptReader.read(malformed)).toEqual([]);

    configureStrictMode({ strictScriptReader: true });
    expect(() => ScriptReader.read(malformed)).toThrow(
      "Pushdata exceeds script length",
    );
  });

  test("strictOutPointValidation rejects script type mismatch", () => {
    const from = issuerPrivateKey.Address;

    configureStrictMode({ strictOutPointValidation: true });

    expect(
      () =>
        new OutPoint(
          "33".repeat(32),
          0,
          p2pkhScript(from),
          1000,
          from,
          ScriptType.dstas,
        ),
    ).toThrow("OutPoint scriptType mismatch");
  });

  test("strictMultisigKeys rejects duplicate authority keys", () => {
    configureStrictMode({ strictMultisigKeys: true });

    const issuerAddress = issuerPrivateKey.Address;
    const issuerTokenId = toHex(issuerAddress.Hash160);
    const issuerOutPoint = new OutPoint(
      "44".repeat(32),
      0,
      p2pkhScript(issuerAddress),
      4000,
      issuerAddress,
      ScriptType.p2pkh,
    );

    const duplicatePubKey = toHex(issuerPrivateKey.PublicKey);
    const scheme = new TokenScheme("Strict", issuerTokenId, "ST", 1, {
      freeze: true,
      freezeAuthority: {
        m: 2,
        publicKeys: [duplicatePubKey, duplicatePubKey],
      },
    });

    expect(() =>
      BuildDstasIssueTxs({
        fundingPayment: { OutPoint: issuerOutPoint, Owner: issuerPrivateKey },
        scheme,
        destinations: [{ Satoshis: 100, To: issuerAddress }],
      }),
    ).toThrow("duplicate public keys");
  });

  test("strict script evaluation enforces opcode limits", () => {
    configureStrictMode({ strictScriptEvaluation: true });

    const tx = TransactionReader.readHex(TransferNoNoteRaw);
    const result = evaluateScripts(
      new Uint8Array([OpCode.OP_1]),
      new Uint8Array([OpCode.OP_1]),
      {
        tx,
        inputIndex: 0,
        prevOutputs: [{ lockingScript: new Uint8Array(), satoshis: 1 }],
      },
      { maxOps: 1 },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Opcode count exceeds strict limit");
  });
});
