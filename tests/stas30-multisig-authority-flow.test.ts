import {
  Address,
  OutPoint,
  ScriptType,
  SignatureHashType,
  TokenScheme,
  Wallet,
} from "../src/bitcoin";
import { OpCode } from "../src/bitcoin/op-codes";
import { fromHex, toHex } from "../src/bytes";
import { hash160, hash256 } from "../src/hashes";
import { P2pkhBuilder } from "../src/script/build/p2pkh-builder";
import { ScriptBuilder } from "../src/script/build/script-builder";
import {
  buildStas3Flags,
  buildStas3FreezeMultisigTokens,
} from "../src/script/build/stas3-freeze-multisig-builder";
import { evaluateTransactionHex } from "../src/script";
import {
  BuildStas3IssueTxs,
  BuildStas3TransferTx,
} from "../src/stas30-factory";
import { FeeRate } from "../src/transaction-factory";
import { TransactionBuilder } from "../src/transaction/build/transaction-builder";
import { OutputBuilder } from "../src/transaction/build/output-builder";
import { TransactionReader } from "../src/transaction/read/transaction-reader";
import { reverseBytes } from "../src/buffer/buffer-utils";
import { assertFeeInRange } from "./helpers/fee-assertions";

const mnemonic =
  "group spy extend supreme monkey judge avocado cancel exit educate modify bubble";

const resolveFromTx = (txHex: string) => {
  const tx = TransactionReader.readHex(txHex);
  return (txId: string, vout: number) => {
    if (txId !== tx.Id) return undefined;
    const out = tx.Outputs[vout];
    if (!out) return undefined;
    return { lockingScript: out.LockignScript, satoshis: out.Satoshis };
  };
};

const buildAuthorityMlpkhPreimage = (
  m: number,
  authorityPubKeys: Uint8Array[],
): Uint8Array => {
  const n = authorityPubKeys.length;
  const out = new Uint8Array(1 + n * (1 + 33) + 1);
  let off = 0;
  out[off++] = m & 0xff;
  for (const key of authorityPubKeys) {
    out[off++] = 0x21;
    out.set(key, off);
    off += key.length;
  }
  out[off] = n & 0xff;
  return out;
};

const buildAuthorityServiceField = (scheme: TokenScheme): Uint8Array => {
  const authority = scheme.Authority!;
  const pubKeys = authority.publicKeys.map((x) => fromHex(x));
  if (authority.m === 1 && pubKeys.length === 1) return hash160(pubKeys[0]);
  return hash160(buildAuthorityMlpkhPreimage(authority.m, pubKeys));
};

const buildStas30LockingScript = (
  owner: Address,
  scheme: TokenScheme,
  frozen: boolean,
) => {
  const tokens = buildStas3FreezeMultisigTokens({
    ownerPkh: owner.Hash160,
    secondField: null,
    redemptionPkh: fromHex(scheme.TokenId),
    frozen,
    flags: buildStas3Flags({ freezable: scheme.Freeze }),
    serviceFields: [buildAuthorityServiceField(scheme)],
    optionalData: [],
  });

  return ScriptBuilder.fromTokens(tokens, ScriptType.p2stas30);
};

const buildAuthorityUnlockingScript = ({
  txBuilder,
  stasInputIndex,
  spendingType,
  authoritySigners,
  authorityPubKeys,
  authorityThreshold,
}: {
  txBuilder: TransactionBuilder;
  stasInputIndex: number;
  spendingType: number;
  authoritySigners: Wallet[];
  authorityPubKeys: Uint8Array[];
  authorityThreshold: number;
}) => {
  const script = new ScriptBuilder(ScriptType.p2stas);
  let hasNote = false;
  let hasChange = false;

  for (const output of txBuilder.Outputs) {
    if (output.LockingScript.ScriptType === ScriptType.nullData) {
      const payload = output.LockingScript.toBytes().subarray(2);
      script.addData(payload);
      hasNote = true;
      continue;
    }

    if (!output.LockingScript.ToAddress) {
      throw new Error("Output locking script must have ToAddress");
    }

    script
      .addNumber(output.Satoshis)
      .addData(output.LockingScript.ToAddress.Hash160);

    if (output.LockingScript.ScriptType === ScriptType.p2stas30) {
      const secondFieldToken = output.LockingScript._tokens[1];
      if (secondFieldToken?.Data) {
        script.addData(secondFieldToken.Data);
      } else if (secondFieldToken) {
        script.addOpCode(secondFieldToken.OpCodeNum);
      } else {
        throw new Error("STAS30 output missing second-field token");
      }
    }

    if (output.LockingScript.ScriptType === ScriptType.p2pkh) hasChange = true;
  }

  if (!hasChange) {
    script.addOpCode(OpCode.OP_0);
    script.addOpCode(OpCode.OP_0);
  }
  if (!hasNote) script.addOpCode(OpCode.OP_0);

  const fundingInput = txBuilder.Inputs[txBuilder.Inputs.length - 1];
  script
    .addNumber(fundingInput.OutPoint.Vout)
    .addData(reverseBytes(fromHex(fundingInput.OutPoint.TxId)))
    .addOpCode(OpCode.OP_0);

  const preimage = txBuilder.Inputs[stasInputIndex].preimage(
    TransactionBuilder.DefaultSighashType as SignatureHashType,
  );
  const preimageHash = hash256(preimage);

  script.addData(preimage).addNumber(spendingType);

  // OP_0 dummy required by CHECKMULTISIG semantics.
  script.addOpCode(OpCode.OP_0);

  for (const signer of authoritySigners) {
    const der = signer.sign(preimageHash);
    const derWithType = new Uint8Array(der.length + 1);
    derWithType.set(der);
    derWithType[der.length] = TransactionBuilder.DefaultSighashType;
    script.addData(derWithType);
  }

  script.addData(
    buildAuthorityMlpkhPreimage(authorityThreshold, authorityPubKeys),
  );

  return script.toBytes();
};

const applyChangeAndFinalAuthorityUnlocking = ({
  txBuilder,
  feeInputSatoshis,
  changeAddress,
  stasInputIndex,
  spendingType,
  authoritySigners,
  authorityPubKeys,
  authorityThreshold,
}: {
  txBuilder: TransactionBuilder;
  feeInputSatoshis: number;
  changeAddress: Address;
  stasInputIndex: number;
  spendingType: number;
  authoritySigners: Wallet[];
  authorityPubKeys: Uint8Array[];
  authorityThreshold: number;
}) => {
  const changeOutput = new OutputBuilder(new P2pkhBuilder(changeAddress), 0);
  txBuilder.Outputs.splice(1, 0, changeOutput);
  txBuilder.Inputs[stasInputIndex].Stas30SpendingType = spendingType;

  let prevChange = -1;
  for (let i = 0; i < 5; i++) {
    txBuilder.Inputs[stasInputIndex].UnlockingScript =
      buildAuthorityUnlockingScript({
        txBuilder,
        stasInputIndex,
        spendingType,
        authoritySigners,
        authorityPubKeys,
        authorityThreshold,
      });

    const fee = txBuilder.getFee(FeeRate);
    const nextChange = feeInputSatoshis - fee;
    if (nextChange <= 0) throw new Error("Insufficient satoshis for fee");
    changeOutput.Satoshis = nextChange;
    if (nextChange === prevChange) break;
    prevChange = nextChange;
  }

  txBuilder.Inputs[stasInputIndex].UnlockingScript =
    buildAuthorityUnlockingScript({
      txBuilder,
      stasInputIndex,
      spendingType,
      authoritySigners,
      authorityPubKeys,
      authorityThreshold,
    });
};

describe("stas30 multisig authority flow", () => {
  test("dummy funding: issue -> transfer -> freeze(3/5) -> unfreeze(3/5) -> transfer", () => {
    const bob = Wallet.fromMnemonic(mnemonic).deriveWallet("m/44'/236'/0'/0/0");
    const cat1 =
      Wallet.fromMnemonic(mnemonic).deriveWallet("m/44'/236'/0'/0/1");
    const cat2 =
      Wallet.fromMnemonic(mnemonic).deriveWallet("m/44'/236'/0'/0/2");
    const cat3 =
      Wallet.fromMnemonic(mnemonic).deriveWallet("m/44'/236'/0'/0/3");
    const cat4 =
      Wallet.fromMnemonic(mnemonic).deriveWallet("m/44'/236'/0'/0/4");
    const cat5 =
      Wallet.fromMnemonic(mnemonic).deriveWallet("m/44'/236'/0'/0/5");
    const alice =
      Wallet.fromMnemonic(mnemonic).deriveWallet("m/44'/236'/0'/0/6");

    const fundingOutPoint = new OutPoint(
      "11".repeat(32),
      0,
      new P2pkhBuilder(bob.Address).toBytes(),
      20_000,
      bob.Address,
      ScriptType.p2pkh,
    );

    const authorityPubKeys = [
      cat1.PublicKey,
      cat2.PublicKey,
      cat3.PublicKey,
      cat4.PublicKey,
      cat5.PublicKey,
    ];

    const scheme = new TokenScheme(
      "STAS30-MSIG-AUTH",
      toHex(bob.Address.Hash160),
      "S30M",
      1,
      {
        freeze: true,
        confiscation: false,
        isDivisible: true,
        authority: {
          m: 3,
          publicKeys: authorityPubKeys.map((k) => toHex(k)),
        },
      },
    );

    const { contractTxHex, issueTxHex } = BuildStas3IssueTxs({
      fundingPayment: {
        OutPoint: fundingOutPoint,
        Owner: bob,
      },
      scheme,
      destinations: [
        {
          Satoshis: 100,
          To: alice.Address,
        },
      ],
    });

    const contractEval = evaluateTransactionHex(
      contractTxHex,
      (txId, vout) => {
        if (txId !== fundingOutPoint.TxId || vout !== fundingOutPoint.Vout)
          return undefined;
        return {
          lockingScript: fundingOutPoint.LockignScript,
          satoshis: fundingOutPoint.Satoshis,
        };
      },
      { allowOpReturn: true },
    );
    expect(contractEval.success).toBe(true);
    assertFeeInRange(
      contractTxHex,
      (txId, vout) => {
        if (txId !== fundingOutPoint.TxId || vout !== fundingOutPoint.Vout)
          return undefined;
        return {
          lockingScript: fundingOutPoint.LockignScript,
          satoshis: fundingOutPoint.Satoshis,
        };
      },
      FeeRate,
      1,
    );

    const issueEval = evaluateTransactionHex(
      issueTxHex,
      resolveFromTx(contractTxHex),
      {
        allowOpReturn: true,
      },
    );
    expect(issueEval.success).toBe(true);
    assertFeeInRange(issueTxHex, resolveFromTx(contractTxHex), FeeRate, 2);

    const issueTx = TransactionReader.readHex(issueTxHex);
    const issueStasOutPoint = new OutPoint(
      issueTx.Id,
      0,
      issueTx.Outputs[0].LockignScript,
      issueTx.Outputs[0].Satoshis,
      alice.Address,
      ScriptType.p2stas30,
    );
    const issueFeeOutPoint = new OutPoint(
      issueTx.Id,
      1,
      issueTx.Outputs[1].LockignScript,
      issueTx.Outputs[1].Satoshis,
      bob.Address,
      ScriptType.p2pkh,
    );

    const transfer1TxHex = BuildStas3TransferTx({
      stasPayment: {
        OutPoint: issueStasOutPoint,
        Owner: alice,
      },
      feePayment: {
        OutPoint: issueFeeOutPoint,
        Owner: bob,
      },
      Scheme: scheme,
      destination: {
        Satoshis: issueStasOutPoint.Satoshis,
        To: bob.Address,
      },
    });
    const transfer1Eval = evaluateTransactionHex(
      transfer1TxHex,
      resolveFromTx(issueTxHex),
      { allowOpReturn: true },
    );
    expect(transfer1Eval.success).toBe(true);
    assertFeeInRange(transfer1TxHex, resolveFromTx(issueTxHex), FeeRate, 2);

    const transfer1Tx = TransactionReader.readHex(transfer1TxHex);
    const transfer1StasOutPoint = new OutPoint(
      transfer1Tx.Id,
      0,
      transfer1Tx.Outputs[0].LockignScript,
      transfer1Tx.Outputs[0].Satoshis,
      bob.Address,
      ScriptType.p2stas30,
    );
    const transfer1FeeOutPoint = new OutPoint(
      transfer1Tx.Id,
      1,
      transfer1Tx.Outputs[1].LockignScript,
      transfer1Tx.Outputs[1].Satoshis,
      bob.Address,
      ScriptType.p2pkh,
    );

    const freezeBuilder = TransactionBuilder.init()
      .addInput(transfer1StasOutPoint, cat1)
      .addInput(transfer1FeeOutPoint, bob);
    freezeBuilder.Outputs.push(
      new OutputBuilder(
        buildStas30LockingScript(bob.Address, scheme, true),
        transfer1StasOutPoint.Satoshis,
      ),
    );
    applyChangeAndFinalAuthorityUnlocking({
      txBuilder: freezeBuilder,
      feeInputSatoshis: transfer1FeeOutPoint.Satoshis,
      changeAddress: bob.Address,
      stasInputIndex: 0,
      spendingType: 2,
      authoritySigners: [cat1, cat3, cat5],
      authorityPubKeys,
      authorityThreshold: 3,
    });
    const freezeTxHex = freezeBuilder.sign().toHex();

    const freezeEval = evaluateTransactionHex(
      freezeTxHex,
      resolveFromTx(transfer1TxHex),
      {
        allowOpReturn: true,
      },
    );
    expect(freezeEval.success).toBe(true);
    assertFeeInRange(freezeTxHex, resolveFromTx(transfer1TxHex), FeeRate, 4);

    const freezeTx = TransactionReader.readHex(freezeTxHex);
    const frozenStasOutPoint = new OutPoint(
      freezeTx.Id,
      0,
      freezeTx.Outputs[0].LockignScript,
      freezeTx.Outputs[0].Satoshis,
      bob.Address,
      ScriptType.p2stas30,
    );
    const frozenFeeOutPoint = new OutPoint(
      freezeTx.Id,
      1,
      freezeTx.Outputs[1].LockignScript,
      freezeTx.Outputs[1].Satoshis,
      bob.Address,
      ScriptType.p2pkh,
    );

    const unfreezeBuilder = TransactionBuilder.init()
      .addInput(frozenStasOutPoint, cat1)
      .addInput(frozenFeeOutPoint, bob);
    unfreezeBuilder.Outputs.push(
      new OutputBuilder(
        buildStas30LockingScript(bob.Address, scheme, false),
        frozenStasOutPoint.Satoshis,
      ),
    );
    applyChangeAndFinalAuthorityUnlocking({
      txBuilder: unfreezeBuilder,
      feeInputSatoshis: frozenFeeOutPoint.Satoshis,
      changeAddress: bob.Address,
      stasInputIndex: 0,
      spendingType: 2,
      authoritySigners: [cat1, cat2, cat4],
      authorityPubKeys,
      authorityThreshold: 3,
    });
    const unfreezeTxHex = unfreezeBuilder.sign().toHex();

    const unfreezeEval = evaluateTransactionHex(
      unfreezeTxHex,
      resolveFromTx(freezeTxHex),
      { allowOpReturn: true },
    );
    expect(unfreezeEval.success).toBe(true);
    assertFeeInRange(unfreezeTxHex, resolveFromTx(freezeTxHex), FeeRate, 4);

    const unfreezeTx = TransactionReader.readHex(unfreezeTxHex);
    const unfrozenStasOutPoint = new OutPoint(
      unfreezeTx.Id,
      0,
      unfreezeTx.Outputs[0].LockignScript,
      unfreezeTx.Outputs[0].Satoshis,
      bob.Address,
      ScriptType.p2stas30,
    );
    const transfer2FeeOutPoint = new OutPoint(
      unfreezeTx.Id,
      1,
      unfreezeTx.Outputs[1].LockignScript,
      unfreezeTx.Outputs[1].Satoshis,
      bob.Address,
      ScriptType.p2pkh,
    );

    const transfer2TxHex = BuildStas3TransferTx({
      stasPayment: {
        OutPoint: unfrozenStasOutPoint,
        Owner: bob,
      },
      feePayment: {
        OutPoint: transfer2FeeOutPoint,
        Owner: bob,
      },
      Scheme: scheme,
      destination: {
        Satoshis: unfrozenStasOutPoint.Satoshis,
        To: alice.Address,
      },
    });
    const transfer2Eval = evaluateTransactionHex(
      transfer2TxHex,
      resolveFromTx(unfreezeTxHex),
      { allowOpReturn: true },
    );
    expect(transfer2Eval.success).toBe(true);
    assertFeeInRange(transfer2TxHex, resolveFromTx(unfreezeTxHex), FeeRate, 2);
  });
});
