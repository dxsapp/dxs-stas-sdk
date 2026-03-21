import { readFileSync } from "fs";
import { ByteReader } from "../src/binary";
import { bs58check } from "../src/base";
import { Address } from "../src/bitcoin/address";
import { OpCode } from "../src/bitcoin/op-codes";
import { PrivateKey } from "../src/bitcoin/private-key";
import { Wallet } from "../src/bitcoin/wallet";
import { TransactionBuilder } from "../src/transaction/build/transaction-builder";
import { OutputBuilder } from "../src/transaction/build/output-builder";
import {
  evaluateScripts,
  evaluateTransactionHex,
  buildSwapActionData,
  buildDstasLockingScriptForOwnerField,
  computeDstasRequestedScriptHash,
  decomposeDstasLockingScript,
  decomposeDstasUnlockingScript,
} from "../src/script";
import { TransactionReader } from "../src/transaction/read/transaction-reader";
import { fromHex, toHex } from "../src/bytes";
import { OutPoint, ScriptType } from "../src/bitcoin";
import { TokenScheme } from "../src/bitcoin/token-scheme";
import {
  BuildDstasBaseTx,
  BuildDstasConfiscateTx,
  BuildDstasFreezeTx,
  BuildDstasIssueTxs,
  BuildDstasSwapSwapTx,
  BuildDstasSwapTx,
  BuildDstasTransferSwapTx,
  BuildDstasTransferTx,
  BuildDstasUnfreezeTx,
} from "../src/dstas-factory";
import { FeeRate } from "../src/transaction-factory";
import {
  buildFreezeFromFixture,
  buildTransferFromFixture,
  createDefaultDstasScheme,
  createRealFundingOutPoint,
  createRealFundingFlowFixture,
} from "./helpers/dstas-flow-helpers";
import {
  buildMlpkhPreimage,
  buildOwnerMultisigUnlockingScript,
  buildRedeemTx,
  createSwapContext,
  referenceTransferTxPath,
  resolveFromTx,
  strictResolverFromTxHexes,
  swapDestination,
} from "./helpers/dstas-flow-shared";
import { assertFeeInRange } from "./helpers/fee-assertions";
import { hash160, hash256 } from "../src/hashes";
import { reverseBytes } from "../src/buffer/buffer-utils";

describe("dstas flow", () => {
  test("reference transfer (P2PKH): stas input validates with preimage-derived prevout", () => {
    const txHex = readFileSync(referenceTransferTxPath, "utf8").trim();
    const tx = TransactionReader.readHex(txHex);
    const unlock = decomposeDstasUnlockingScript(tx.Inputs[0].UnlockingScript);
    const lock = decomposeDstasLockingScript(tx.Outputs[0].LockingScript);

    const preimage = fromHex(unlock.preimageHex!);
    const reader = new ByteReader(preimage);
    reader.readUInt32();
    reader.readChunk(32);
    reader.readChunk(32);
    reader.readChunk(32);
    reader.readUInt32();
    const prevScript = reader.readVarChunk();
    const prevSatoshis = reader.readUInt64();

    const dummyFeeLock = Uint8Array.from([
      0x76,
      0xa9,
      0x14,
      ...Array(20).fill(0),
      0x88,
      0xac,
    ]);

    const evalInput0 = evaluateScripts(
      tx.Inputs[0].UnlockingScript,
      prevScript,
      {
        tx,
        inputIndex: 0,
        prevOutputs: [
          { lockingScript: prevScript, satoshis: prevSatoshis },
          { lockingScript: dummyFeeLock, satoshis: 1_000 },
        ],
      },
      { allowOpReturn: true, trace: true, traceLimit: 1_200 },
    );

    const decodedWif = bs58check.decode(
      "cSApidrMXZzYHTTmHRRNjCksbXZ7jhed1zK8Fg28Vg8XNgKcRCpS",
    );
    const signer = new PrivateKey(decodedWif.subarray(1, 33));

    expect(tx.Inputs.length).toBe(2);
    expect(tx.Outputs.length).toBe(1);
    expect(unlock.parsed).toBe(true);
    expect(unlock.spendingType).toBe(1);
    expect(unlock.authPlaceholderOpcodes).toEqual([0, 0, 0]);
    expect(unlock.signatureHex?.slice(-2)).toBe("41");
    expect(lock.ownerPkhHex).toBeDefined();
    expect(toHex(signer.PublicKey).toLowerCase()).toBe(
      unlock.publicKeyHex?.toLowerCase(),
    );
    expect(evalInput0.success).toBe(true);
  });

  test("real funding: build contract + issue are valid", () => {
    const fixture = createRealFundingFlowFixture();

    const contractEval = evaluateTransactionHex(
      fixture.contractTxHex,
      (txId, vout) => {
        if (
          txId !== fixture.sourceFunding.TxId ||
          vout !== fixture.sourceFunding.Vout
        ) {
          return undefined;
        }
        return {
          lockingScript: fixture.sourceFunding.LockingScript,
          satoshis: fixture.sourceFunding.Satoshis,
        };
      },
      { allowOpReturn: true },
    );

    const issueEval = evaluateTransactionHex(
      fixture.issueTxHex,
      resolveFromTx(fixture.contractTxHex),
      { allowOpReturn: true },
    );
    const issueTx = TransactionReader.readHex(fixture.issueTxHex);

    expect(fixture.contractTx.Inputs.length).toBe(1);
    expect(fixture.contractTx.Outputs.length).toBe(2);
    expect(fixture.issueTx.Inputs.length).toBe(2);
    expect(fixture.issueTx.Outputs.length).toBe(2);
    expect(contractEval.success).toBe(true);
    expect(issueEval.success).toBe(true);
    expect(issueTx.Outputs[0].ScriptType).toBe(ScriptType.dstas);
    expect(issueTx.Outputs[1].ScriptType).toBe(ScriptType.p2pkh);
  });

  test("real funding: transfer no-change flow is valid", () => {
    const fixture = createRealFundingFlowFixture();
    const transferTxHex = buildTransferFromFixture(fixture, true);
    const transferTx = TransactionReader.readHex(transferTxHex);

    const transferEval = evaluateTransactionHex(
      transferTxHex,
      resolveFromTx(fixture.issueTxHex),
      { allowOpReturn: true },
    );

    expect(transferTx.Inputs.length).toBe(2);
    expect(transferTx.Outputs.length).toBe(1);
    expect(transferTx.Outputs[0].Satoshis).toBe(100);
    expect(transferEval.success).toBe(true);
    expect(transferEval.inputs.find((x) => x.inputIndex === 0)?.success).toBe(
      true,
    );
    expect(transferEval.inputs.find((x) => x.inputIndex === 1)?.success).toBe(
      true,
    );
  });

  test("real funding: transfer with-change flow (current failing case)", () => {
    const fixture = createRealFundingFlowFixture();
    const transferTxHex = buildTransferFromFixture(fixture, false);
    const transferTx = TransactionReader.readHex(transferTxHex);

    const transferEval = evaluateTransactionHex(
      transferTxHex,
      resolveFromTx(fixture.issueTxHex),
      { allowOpReturn: true },
    );

    const unlock = decomposeDstasUnlockingScript(
      transferTx.Inputs[0].UnlockingScript,
    );

    expect(transferTx.Inputs.length).toBe(2);
    expect(transferTx.Outputs.length).toBe(2);
    expect(unlock.parsed).toBe(true);
    expect(unlock.spendingType).toBe(1);
    expect(transferEval.success).toBe(true);
  });

  test("real funding: transfer to owner-multisig output is valid", () => {
    const fixture = createRealFundingFlowFixture();
    const multisigTransferTxHex = BuildDstasTransferTx({
      stasPayment: {
        OutPoint: fixture.stasOutPoint,
        Owner: fixture.alice,
      },
      feePayment: {
        OutPoint: fixture.feeOutPoint,
        Owner: fixture.bob,
      },
      scheme: fixture.scheme,
      destination: {
        Satoshis: fixture.stasOutPoint.Satoshis,
        ToOwnerMultisig: {
          m: 2,
          publicKeys: [
            toHex(fixture.bob.PublicKey),
            toHex(fixture.cat.PublicKey),
            toHex(fixture.alice.PublicKey),
          ],
        },
      },
      omitChangeOutput: true,
    });

    const evalResult = evaluateTransactionHex(
      multisigTransferTxHex,
      resolveFromTx(fixture.issueTxHex),
      { allowOpReturn: true },
    );
    const tx = TransactionReader.readHex(multisigTransferTxHex);

    expect(evalResult.success).toBe(true);
    expect(tx.Outputs[0].ScriptType).toBe(ScriptType.dstas);
    expect(tx.Outputs[0].Address).toBeDefined();
  });

  test("real funding: transfer uses canonical scheme field", () => {
    const fixture = createRealFundingFlowFixture();
    const canonicalTxHex = BuildDstasTransferTx({
      stasPayment: {
        OutPoint: fixture.stasOutPoint,
        Owner: fixture.alice,
      },
      feePayment: {
        OutPoint: fixture.feeOutPoint,
        Owner: fixture.bob,
      },
      scheme: fixture.scheme,
      destination: {
        Satoshis: fixture.stasOutPoint.Satoshis,
        To: fixture.alice.Address,
      },
      omitChangeOutput: true,
    });

    const evalResult = evaluateTransactionHex(
      canonicalTxHex,
      resolveFromTx(fixture.issueTxHex),
      { allowOpReturn: true },
    );

    expect(evalResult.success).toBe(true);
  });

  test("real funding: owner-multisig can spend token with m-of-n unlocking", () => {
    const fixture = createRealFundingFlowFixture();
    const ownerPubKeys = [
      fixture.bob.PublicKey,
      fixture.cat.PublicKey,
      fixture.alice.PublicKey,
    ];
    const ownerThreshold = 2;
    const ownerMlpkh = hash160(
      buildMlpkhPreimage(ownerThreshold, ownerPubKeys),
    );

    const toOwnerMultisigTxHex = BuildDstasTransferTx({
      stasPayment: {
        OutPoint: fixture.stasOutPoint,
        Owner: fixture.alice,
      },
      feePayment: {
        OutPoint: fixture.feeOutPoint,
        Owner: fixture.bob,
      },
      scheme: fixture.scheme,
      destination: {
        Satoshis: fixture.stasOutPoint.Satoshis,
        ToOwnerMultisig: {
          m: ownerThreshold,
          publicKeys: ownerPubKeys.map((x) => toHex(x)),
        },
      },
    });

    const prevTx = TransactionReader.readHex(toOwnerMultisigTxHex);
    const stasOutPoint = new OutPoint(
      prevTx.Id,
      0,
      prevTx.Outputs[0].LockingScript,
      prevTx.Outputs[0].Satoshis,
      new Address(ownerMlpkh),
      ScriptType.dstas,
    );
    const feeOutPoint = new OutPoint(
      prevTx.Id,
      1,
      prevTx.Outputs[1].LockingScript,
      prevTx.Outputs[1].Satoshis,
      fixture.bob.Address,
      ScriptType.p2pkh,
    );

    const authorityServiceField = hash160(fixture.cat.PublicKey);
    const transferOutLock = buildDstasLockingScriptForOwnerField({
      ownerField: fixture.bob.Address.Hash160,
      tokenIdHex: fixture.scheme.TokenId,
      freezable: fixture.scheme.Freeze,
      confiscatable: fixture.scheme.Confiscation,
      authorityServiceField,
      confiscationAuthorityServiceField: authorityServiceField,
      frozen: false,
    });

    const txBuilder = TransactionBuilder.init()
      .addInput(stasOutPoint, fixture.bob)
      .addInput(feeOutPoint, fixture.bob);

    txBuilder.Outputs.push(
      new OutputBuilder(transferOutLock, stasOutPoint.Satoshis),
    );

    txBuilder.Inputs[0].UnlockingScript = buildOwnerMultisigUnlockingScript({
      txBuilder,
      stasInputIndex: 0,
      spendingType: 1,
      signers: [fixture.bob, fixture.cat],
      pubKeys: ownerPubKeys,
      threshold: ownerThreshold,
    });

    const spendTxHex = txBuilder.sign().toHex();
    const evalResult = evaluateTransactionHex(
      spendTxHex,
      resolveFromTx(toOwnerMultisigTxHex),
      { allowOpReturn: true },
    );

    expect(evalResult.success).toBe(true);
    expect(evalResult.inputs.find((x) => x.inputIndex === 0)?.success).toBe(
      true,
    );
  });

  test("real funding: owner-multisig rejects insufficient signatures", () => {
    const fixture = createRealFundingFlowFixture();
    const ownerPubKeys = [
      fixture.bob.PublicKey,
      fixture.cat.PublicKey,
      fixture.alice.PublicKey,
    ];
    const ownerThreshold = 2;
    const ownerMlpkh = hash160(
      buildMlpkhPreimage(ownerThreshold, ownerPubKeys),
    );
    const rogue = Wallet.fromMnemonic(
      "group spy extend supreme monkey judge avocado cancel exit educate modify bubble",
    ).deriveWallet("m/44'/236'/0'/0/9");

    const toOwnerMultisigTxHex = BuildDstasTransferTx({
      stasPayment: {
        OutPoint: fixture.stasOutPoint,
        Owner: fixture.alice,
      },
      feePayment: {
        OutPoint: fixture.feeOutPoint,
        Owner: fixture.bob,
      },
      scheme: fixture.scheme,
      destination: {
        Satoshis: fixture.stasOutPoint.Satoshis,
        ToOwnerMultisig: {
          m: ownerThreshold,
          publicKeys: ownerPubKeys.map((x) => toHex(x)),
        },
      },
    });

    const prevTx = TransactionReader.readHex(toOwnerMultisigTxHex);
    const stasOutPoint = new OutPoint(
      prevTx.Id,
      0,
      prevTx.Outputs[0].LockingScript,
      prevTx.Outputs[0].Satoshis,
      new Address(ownerMlpkh),
      ScriptType.dstas,
    );
    const feeOutPoint = new OutPoint(
      prevTx.Id,
      1,
      prevTx.Outputs[1].LockingScript,
      prevTx.Outputs[1].Satoshis,
      fixture.bob.Address,
      ScriptType.p2pkh,
    );

    const authorityServiceField = hash160(fixture.cat.PublicKey);
    const transferOutLock = buildDstasLockingScriptForOwnerField({
      ownerField: fixture.bob.Address.Hash160,
      tokenIdHex: fixture.scheme.TokenId,
      freezable: fixture.scheme.Freeze,
      confiscatable: fixture.scheme.Confiscation,
      authorityServiceField,
      confiscationAuthorityServiceField: authorityServiceField,
      frozen: false,
    });

    const txBuilder = TransactionBuilder.init()
      .addInput(stasOutPoint, fixture.bob)
      .addInput(feeOutPoint, fixture.bob);

    txBuilder.Outputs.push(
      new OutputBuilder(transferOutLock, stasOutPoint.Satoshis),
    );

    txBuilder.Inputs[0].UnlockingScript = buildOwnerMultisigUnlockingScript({
      txBuilder,
      stasInputIndex: 0,
      spendingType: 1,
      signers: [fixture.bob],
      pubKeys: ownerPubKeys,
      threshold: ownerThreshold,
    });

    const spendTxHex = txBuilder.sign().toHex();
    const evalResult = evaluateTransactionHex(
      spendTxHex,
      resolveFromTx(toOwnerMultisigTxHex),
      { allowOpReturn: true },
    );

    expect(evalResult.success).toBe(false);
    expect(evalResult.inputs.find((x) => x.inputIndex === 0)?.success).toBe(
      false,
    );

    // Ensure the second input remains valid; the failure is on the owner multisig path.
    expect(evalResult.inputs.find((x) => x.inputIndex === 1)?.success).toBe(
      true,
    );
  });

  test("real funding: owner-multisig rejects wrong signer set", () => {
    const fixture = createRealFundingFlowFixture();
    const ownerPubKeys = [
      fixture.bob.PublicKey,
      fixture.cat.PublicKey,
      fixture.alice.PublicKey,
    ];
    const ownerThreshold = 2;
    const ownerMlpkh = hash160(
      buildMlpkhPreimage(ownerThreshold, ownerPubKeys),
    );
    const rogue = Wallet.fromMnemonic(
      "group spy extend supreme monkey judge avocado cancel exit educate modify bubble",
    ).deriveWallet("m/44'/236'/0'/0/9");

    const toOwnerMultisigTxHex = BuildDstasTransferTx({
      stasPayment: {
        OutPoint: fixture.stasOutPoint,
        Owner: fixture.alice,
      },
      feePayment: {
        OutPoint: fixture.feeOutPoint,
        Owner: fixture.bob,
      },
      scheme: fixture.scheme,
      destination: {
        Satoshis: fixture.stasOutPoint.Satoshis,
        ToOwnerMultisig: {
          m: ownerThreshold,
          publicKeys: ownerPubKeys.map((x) => toHex(x)),
        },
      },
    });

    const prevTx = TransactionReader.readHex(toOwnerMultisigTxHex);
    const stasOutPoint = new OutPoint(
      prevTx.Id,
      0,
      prevTx.Outputs[0].LockingScript,
      prevTx.Outputs[0].Satoshis,
      new Address(ownerMlpkh),
      ScriptType.dstas,
    );
    const feeOutPoint = new OutPoint(
      prevTx.Id,
      1,
      prevTx.Outputs[1].LockingScript,
      prevTx.Outputs[1].Satoshis,
      fixture.bob.Address,
      ScriptType.p2pkh,
    );

    const authorityServiceField = hash160(fixture.cat.PublicKey);
    const transferOutLock = buildDstasLockingScriptForOwnerField({
      ownerField: fixture.bob.Address.Hash160,
      tokenIdHex: fixture.scheme.TokenId,
      freezable: fixture.scheme.Freeze,
      confiscatable: fixture.scheme.Confiscation,
      authorityServiceField,
      confiscationAuthorityServiceField: authorityServiceField,
      frozen: false,
    });

    const txBuilder = TransactionBuilder.init()
      .addInput(stasOutPoint, fixture.bob)
      .addInput(feeOutPoint, fixture.bob);

    txBuilder.Outputs.push(
      new OutputBuilder(transferOutLock, stasOutPoint.Satoshis),
    );

    txBuilder.Inputs[0].UnlockingScript = buildOwnerMultisigUnlockingScript({
      txBuilder,
      stasInputIndex: 0,
      spendingType: 1,
      signers: [fixture.bob, rogue],
      pubKeys: ownerPubKeys,
      threshold: ownerThreshold,
    });

    const spendTxHex = txBuilder.sign().toHex();
    const evalResult = evaluateTransactionHex(
      spendTxHex,
      resolveFromTx(toOwnerMultisigTxHex),
      { allowOpReturn: true },
    );

    expect(evalResult.success).toBe(false);
    expect(evalResult.inputs.find((x) => x.inputIndex === 0)?.success).toBe(
      false,
    );
    expect(evalResult.inputs.find((x) => x.inputIndex === 1)?.success).toBe(
      true,
    );
  });

  test("real funding: fee is within expected range for built Divisible STAS steps", () => {
    const fixture = createRealFundingFlowFixture();

    assertFeeInRange(
      fixture.contractTxHex,
      (txId, vout) => {
        if (
          txId !== fixture.sourceFunding.TxId ||
          vout !== fixture.sourceFunding.Vout
        ) {
          return undefined;
        }
        return {
          lockingScript: fixture.sourceFunding.LockingScript,
          satoshis: fixture.sourceFunding.Satoshis,
        };
      },
      FeeRate,
      1,
    );
    assertFeeInRange(
      fixture.issueTxHex,
      resolveFromTx(fixture.contractTxHex),
      FeeRate,
      2,
    );

    const transferTxHex = buildTransferFromFixture(fixture, false);
    assertFeeInRange(
      transferTxHex,
      resolveFromTx(fixture.issueTxHex),
      FeeRate,
      2,
    );

    const freezeTxHex = buildFreezeFromFixture(fixture);
    assertFeeInRange(
      freezeTxHex,
      resolveFromTx(fixture.issueTxHex),
      FeeRate,
      2,
    );

    const freezeTx = TransactionReader.readHex(freezeTxHex);
    const frozenStasOutPoint = new OutPoint(
      freezeTx.Id,
      0,
      freezeTx.Outputs[0].LockingScript,
      freezeTx.Outputs[0].Satoshis,
      fixture.alice.Address,
      ScriptType.dstas,
    );
    const frozenFeeOutPoint = new OutPoint(
      freezeTx.Id,
      1,
      freezeTx.Outputs[1].LockingScript,
      freezeTx.Outputs[1].Satoshis,
      fixture.bob.Address,
      ScriptType.p2pkh,
    );

    const unfreezeTxHex = BuildDstasUnfreezeTx({
      stasPayments: [
        {
          OutPoint: frozenStasOutPoint,
          Owner: fixture.cat,
        },
      ],
      feePayment: {
        OutPoint: frozenFeeOutPoint,
        Owner: fixture.bob,
      },
      destinations: [
        {
          Satoshis: frozenStasOutPoint.Satoshis,
          To: fixture.alice.Address,
          Frozen: false,
        },
      ],
      scheme: fixture.scheme,
    });

    assertFeeInRange(unfreezeTxHex, resolveFromTx(freezeTxHex), FeeRate, 2);
  });
});
