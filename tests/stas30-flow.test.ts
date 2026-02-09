import { readFileSync } from "fs";
import { ByteReader } from "../src/binary";
import { bs58check } from "../src/base";
import { PrivateKey } from "../src/bitcoin/private-key";
import { Wallet } from "../src/bitcoin/wallet";
import { TransactionBuilder } from "../src/transaction/build/transaction-builder";
import { evaluateScripts, evaluateTransactionHex } from "../src/script";
import {
  decomposeStas3LockingScript,
  decomposeStas3UnlockingScript,
} from "../src/script";
import { TransactionReader } from "../src/transaction/read/transaction-reader";
import { fromHex, toHex } from "../src/bytes";
import { OutPoint, ScriptType } from "../src/bitcoin";
import { BuildStas3TransferTx, BuildStas3UnfreezeTx } from "../src/stas30-factory";
import { FeeRate } from "../src/transaction-factory";
import {
  buildFreezeFromFixture,
  buildTransferFromFixture,
  createRealFundingFlowFixture,
} from "./helpers/stas30-flow-helpers";
import { dumpTransferDebug } from "./debug/stas30-transfer-debug";

const resolveFromTx = (txHex: string) => {
  const tx = TransactionReader.readHex(txHex);
  return (txId: string, vout: number) => {
    if (txId !== tx.Id) return undefined;
    const out = tx.Outputs[vout];
    if (!out) return undefined;
    return { lockingScript: out.LockignScript, satoshis: out.Satoshis };
  };
};

const buildRedeemTx = ({
  stasOutPoint,
  stasOwner,
  feeOutPoint,
  feeOwner,
  redeemAddress,
  spendingType = 1,
}: {
  stasOutPoint: OutPoint;
  stasOwner: PrivateKey | Wallet;
  feeOutPoint: OutPoint;
  feeOwner: PrivateKey | Wallet;
  redeemAddress: OutPoint["Address"];
  spendingType?: number;
}) => {
  const txBuilder = TransactionBuilder.init()
    .addInput(stasOutPoint, stasOwner)
    .addInput(feeOutPoint, feeOwner)
    .addP2PkhOutput(stasOutPoint.Satoshis, redeemAddress);

  const feeOutputIdx = txBuilder.Outputs.length;
  txBuilder.Inputs[0].Stas30SpendingType = spendingType;

  return txBuilder
    .addChangeOutputWithFee(
      feeOutPoint.Address,
      feeOutPoint.Satoshis,
      FeeRate,
      feeOutputIdx,
    )
    .sign()
    .toHex();
};

describe("stas30 flow", () => {
  test("reference transfer (P2PKH): stas input validates with preimage-derived prevout", () => {
    const txHex = readFileSync(".temp/Transfer P2PKH TX.txt", "utf8").trim();
    const tx = TransactionReader.readHex(txHex);
    const unlock = decomposeStas3UnlockingScript(tx.Inputs[0].UnlockingScript);
    const lock = decomposeStas3LockingScript(tx.Outputs[0].LockignScript);

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
    expect(lock.flagsHex).toBe("aabb00");
    expect(lock.serviceFieldHexes.length).toBe(0);
    expect(lock.errors.length).toBe(0);
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
          lockingScript: fixture.sourceFunding.LockignScript,
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

    expect(fixture.contractTx.Inputs.length).toBe(1);
    expect(fixture.contractTx.Outputs.length).toBe(2);
    expect(fixture.issueTx.Inputs.length).toBe(2);
    expect(fixture.issueTx.Outputs.length).toBe(2);
    expect(contractEval.success).toBe(true);
    expect(issueEval.success).toBe(true);
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

    dumpTransferDebug({
      transferTxHex,
      prevStasLockingScript: fixture.issueTx.Outputs[0].LockignScript,
      prevStasSatoshis: fixture.issueTx.Outputs[0].Satoshis,
      prevFeeLockingScript: fixture.issueTx.Outputs[1].LockignScript,
      prevFeeSatoshis: fixture.issueTx.Outputs[1].Satoshis,
      outPath: ".temp/stas30-transfer-no-change-debug.json",
    });

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

    const unlock = decomposeStas3UnlockingScript(
      transferTx.Inputs[0].UnlockingScript,
    );

    dumpTransferDebug({
      transferTxHex,
      prevStasLockingScript: fixture.issueTx.Outputs[0].LockignScript,
      prevStasSatoshis: fixture.issueTx.Outputs[0].Satoshis,
      prevFeeLockingScript: fixture.issueTx.Outputs[1].LockignScript,
      prevFeeSatoshis: fixture.issueTx.Outputs[1].Satoshis,
      outPath: ".temp/stas30-transfer-with-change-debug.json",
    });

    expect(transferTx.Inputs.length).toBe(2);
    expect(transferTx.Outputs.length).toBe(2);
    expect(unlock.parsed).toBe(true);
    expect(unlock.spendingType).toBe(1);
    expect(transferEval.success).toBe(true);
  });

  test("real funding: freeze flow is valid", () => {
    const fixture = createRealFundingFlowFixture();
    const freezeTxHex = buildFreezeFromFixture(fixture);
    const freezeTx = TransactionReader.readHex(freezeTxHex);

    const freezeEval = evaluateTransactionHex(
      freezeTxHex,
      resolveFromTx(fixture.issueTxHex),
      { allowOpReturn: true },
    );

    expect(freezeTx.Inputs.length).toBe(2);
    expect(freezeTx.Outputs.length).toBe(2);
    expect(freezeTx.Outputs[0].Satoshis).toBe(fixture.stasOutPoint.Satoshis);
    expect(freezeEval.success).toBe(true);
    expect(freezeEval.inputs.find((x) => x.inputIndex === 0)?.success).toBe(
      true,
    );
    expect(freezeEval.inputs.find((x) => x.inputIndex === 1)?.success).toBe(
      true,
    );
  });

  test("real funding: owner cannot spend frozen utxo", () => {
    const fixture = createRealFundingFlowFixture();
    const freezeTxHex = buildFreezeFromFixture(fixture);
    const freezeTx = TransactionReader.readHex(freezeTxHex);

    const frozenStasOutPoint = new OutPoint(
      freezeTx.Id,
      0,
      freezeTx.Outputs[0].LockignScript,
      freezeTx.Outputs[0].Satoshis,
      fixture.alice.Address,
      ScriptType.p2stas30,
    );

    const feeOutPoint = new OutPoint(
      freezeTx.Id,
      1,
      freezeTx.Outputs[1].LockignScript,
      freezeTx.Outputs[1].Satoshis,
      fixture.bob.Address,
      ScriptType.p2pkh,
    );

    const spendFrozenTxHex = BuildStas3TransferTx({
      stasPayment: {
        OutPoint: frozenStasOutPoint,
        Owner: fixture.alice,
      },
      feePayment: {
        OutPoint: feeOutPoint,
        Owner: fixture.bob,
      },
      Scheme: fixture.scheme,
      destination: {
        Satoshis: frozenStasOutPoint.Satoshis,
        To: fixture.bob.Address,
      },
      omitChangeOutput: true,
    });

    const spendFrozenEval = evaluateTransactionHex(
      spendFrozenTxHex,
      resolveFromTx(freezeTxHex),
      { allowOpReturn: true },
    );

    expect(spendFrozenEval.success).toBe(false);
    expect(
      spendFrozenEval.inputs.find((x) => x.inputIndex === 0)?.success,
    ).toBe(false);
  });

  test("real funding: unfreeze flow is valid", () => {
    const fixture = createRealFundingFlowFixture();
    const freezeTxHex = buildFreezeFromFixture(fixture);
    const freezeTx = TransactionReader.readHex(freezeTxHex);

    const frozenStasOutPoint = new OutPoint(
      freezeTx.Id,
      0,
      freezeTx.Outputs[0].LockignScript,
      freezeTx.Outputs[0].Satoshis,
      fixture.alice.Address,
      ScriptType.p2stas30,
    );

    const feeOutPoint = new OutPoint(
      freezeTx.Id,
      1,
      freezeTx.Outputs[1].LockignScript,
      freezeTx.Outputs[1].Satoshis,
      fixture.bob.Address,
      ScriptType.p2pkh,
    );

    const unfreezeTxHex = BuildStas3UnfreezeTx({
      stasPayments: [
        {
          OutPoint: frozenStasOutPoint,
          Owner: fixture.cat,
        },
      ],
      feePayment: {
        OutPoint: feeOutPoint,
        Owner: fixture.bob,
      },
      destinations: [
        {
          Satoshis: frozenStasOutPoint.Satoshis,
          To: fixture.alice.Address,
          Frozen: false,
        },
      ],
      Scheme: fixture.scheme,
    });

    const unfreezeTx = TransactionReader.readHex(unfreezeTxHex);
    const unfreezeEval = evaluateTransactionHex(
      unfreezeTxHex,
      resolveFromTx(freezeTxHex),
      { allowOpReturn: true },
    );

    expect(unfreezeTx.Inputs.length).toBe(2);
    expect(unfreezeTx.Outputs.length).toBe(2);
    expect(unfreezeTx.Outputs[0].Satoshis).toBe(frozenStasOutPoint.Satoshis);
    expect(unfreezeEval.success).toBe(true);
    expect(unfreezeEval.inputs.find((x) => x.inputIndex === 0)?.success).toBe(
      true,
    );
    expect(unfreezeEval.inputs.find((x) => x.inputIndex === 1)?.success).toBe(
      true,
    );
  });

  test("real funding: owner can spend unfrozen utxo", () => {
    const fixture = createRealFundingFlowFixture();
    const freezeTxHex = buildFreezeFromFixture(fixture);
    const freezeTx = TransactionReader.readHex(freezeTxHex);

    const frozenStasOutPoint = new OutPoint(
      freezeTx.Id,
      0,
      freezeTx.Outputs[0].LockignScript,
      freezeTx.Outputs[0].Satoshis,
      fixture.alice.Address,
      ScriptType.p2stas30,
    );

    const freezeFeeOutPoint = new OutPoint(
      freezeTx.Id,
      1,
      freezeTx.Outputs[1].LockignScript,
      freezeTx.Outputs[1].Satoshis,
      fixture.bob.Address,
      ScriptType.p2pkh,
    );

    const unfreezeTxHex = BuildStas3UnfreezeTx({
      stasPayments: [
        {
          OutPoint: frozenStasOutPoint,
          Owner: fixture.cat,
        },
      ],
      feePayment: {
        OutPoint: freezeFeeOutPoint,
        Owner: fixture.bob,
      },
      destinations: [
        {
          Satoshis: frozenStasOutPoint.Satoshis,
          To: fixture.alice.Address,
          Frozen: false,
        },
      ],
      Scheme: fixture.scheme,
    });
    const unfreezeTx = TransactionReader.readHex(unfreezeTxHex);

    const unfrozenStasOutPoint = new OutPoint(
      unfreezeTx.Id,
      0,
      unfreezeTx.Outputs[0].LockignScript,
      unfreezeTx.Outputs[0].Satoshis,
      fixture.alice.Address,
      ScriptType.p2stas30,
    );
    const unfreezeFeeOutPoint = new OutPoint(
      unfreezeTx.Id,
      1,
      unfreezeTx.Outputs[1].LockignScript,
      unfreezeTx.Outputs[1].Satoshis,
      fixture.bob.Address,
      ScriptType.p2pkh,
    );

    const spendUnfrozenTxHex = BuildStas3TransferTx({
      stasPayment: {
        OutPoint: unfrozenStasOutPoint,
        Owner: fixture.alice,
      },
      feePayment: {
        OutPoint: unfreezeFeeOutPoint,
        Owner: fixture.bob,
      },
      Scheme: fixture.scheme,
      destination: {
        Satoshis: unfrozenStasOutPoint.Satoshis,
        To: fixture.bob.Address,
      },
      omitChangeOutput: true,
    });
    const spendUnfrozenEval = evaluateTransactionHex(
      spendUnfrozenTxHex,
      resolveFromTx(unfreezeTxHex),
      { allowOpReturn: true },
    );

    expect(spendUnfrozenEval.success).toBe(true);
    expect(
      spendUnfrozenEval.inputs.find((x) => x.inputIndex === 0)?.success,
    ).toBe(true);
    expect(
      spendUnfrozenEval.inputs.find((x) => x.inputIndex === 1)?.success,
    ).toBe(true);
  });

  test("real funding: redeem by non-issuer is rejected", () => {
    const fixture = createRealFundingFlowFixture();
    const stasOutPoint = fixture.stasOutPoint;
    const feeOutPoint = fixture.feeOutPoint;

    const redeemTxHex = buildRedeemTx({
      stasOutPoint,
      stasOwner: fixture.alice,
      feeOutPoint,
      feeOwner: fixture.bob,
      redeemAddress: fixture.bob.Address,
    });

    const redeemEval = evaluateTransactionHex(
      redeemTxHex,
      resolveFromTx(fixture.issueTxHex),
      { allowOpReturn: true },
    );

    expect(redeemEval.success).toBe(false);
    expect(redeemEval.inputs.find((x) => x.inputIndex === 0)?.success).toBe(
      false,
    );
  });

  test.todo(
    "real funding: issuer can redeem after receiving token (requires confirmed redeem unlocking format for STAS30)",
  );

  test.todo(
    "real funding flow continuation: issue -> transfer -> freeze -> unfreeze -> redeem with on-chain fixtures",
  );
});
