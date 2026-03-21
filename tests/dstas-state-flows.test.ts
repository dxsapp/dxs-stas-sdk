import { Wallet } from "../src/bitcoin/wallet";
import { TokenScheme } from "../src/bitcoin/token-scheme";
import { TransactionReader } from "../src/transaction/read/transaction-reader";
import { OutPoint, ScriptType } from "../src/bitcoin";
import {
  BuildDstasBaseTx,
  BuildDstasConfiscateTx,
  BuildDstasFreezeTx,
  BuildDstasIssueTxs,
  BuildDstasSwapTx,
  BuildDstasTransferTx,
  BuildDstasUnfreezeTx,
} from "../src/dstas-factory";
import { evaluateTransactionHex, buildSwapActionData } from "../src/script";
import { FeeRate } from "../src/transaction-factory";
import { fromHex, toHex } from "../src/bytes";
import { Address } from "../src/bitcoin/address";
import {
  buildFreezeFromFixture,
  buildTransferFromFixture,
  createDefaultDstasScheme,
  createRealFundingFlowFixture,
  createRealFundingOutPoint,
} from "./helpers/dstas-flow-helpers";
import {
  buildRedeemTx,
  resolveFromTx,
  strictResolverFromTxHexes,
} from "./helpers/dstas-flow-shared";

describe("dstas state flows", () => {
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
      freezeTx.Outputs[0].LockingScript,
      freezeTx.Outputs[0].Satoshis,
      fixture.alice.Address,
      ScriptType.dstas,
    );

    const feeOutPoint = new OutPoint(
      freezeTx.Id,
      1,
      freezeTx.Outputs[1].LockingScript,
      freezeTx.Outputs[1].Satoshis,
      fixture.bob.Address,
      ScriptType.p2pkh,
    );

    const spendFrozenTxHex = BuildDstasTransferTx({
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

  test("real funding: authority can confiscate frozen utxo", () => {
    const fixture = createRealFundingFlowFixture();
    const freezeTxHex = buildFreezeFromFixture(fixture);
    const freezeTx = TransactionReader.readHex(freezeTxHex);

    const frozenStasOutPoint = new OutPoint(
      freezeTx.Id,
      0,
      freezeTx.Outputs[0].LockingScript,
      freezeTx.Outputs[0].Satoshis,
      fixture.alice.Address,
      ScriptType.dstas,
    );

    const feeOutPoint = new OutPoint(
      freezeTx.Id,
      1,
      freezeTx.Outputs[1].LockingScript,
      freezeTx.Outputs[1].Satoshis,
      fixture.bob.Address,
      ScriptType.p2pkh,
    );

    const confiscateTxHex = BuildDstasConfiscateTx({
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
          To: fixture.bob.Address,
          Frozen: false,
        },
      ],
      Scheme: fixture.scheme,
    });

    const confiscateEval = evaluateTransactionHex(
      confiscateTxHex,
      resolveFromTx(freezeTxHex),
      { allowOpReturn: true },
    );
    expect(confiscateEval.success).toBe(true);
    expect(confiscateEval.inputs.find((x) => x.inputIndex === 0)?.success).toBe(
      true,
    );
  });

  test("real funding: issue -> transfer -> confiscate is valid", () => {
    const fixture = createRealFundingFlowFixture();

    const transferTxHex = BuildDstasTransferTx({
      stasPayment: {
        OutPoint: fixture.stasOutPoint,
        Owner: fixture.alice,
      },
      feePayment: {
        OutPoint: fixture.feeOutPoint,
        Owner: fixture.bob,
      },
      Scheme: fixture.scheme,
      destination: {
        Satoshis: fixture.stasOutPoint.Satoshis,
        To: fixture.bob.Address,
      },
    });
    const transferTx = TransactionReader.readHex(transferTxHex);

    const transferredStasOutPoint = new OutPoint(
      transferTx.Id,
      0,
      transferTx.Outputs[0].LockingScript,
      transferTx.Outputs[0].Satoshis,
      fixture.bob.Address,
      ScriptType.dstas,
    );
    const transferFeeOutPoint = new OutPoint(
      transferTx.Id,
      1,
      transferTx.Outputs[1].LockingScript,
      transferTx.Outputs[1].Satoshis,
      fixture.bob.Address,
      ScriptType.p2pkh,
    );

    const confiscateTxHex = BuildDstasConfiscateTx({
      stasPayments: [
        {
          OutPoint: transferredStasOutPoint,
          Owner: fixture.cat,
        },
      ],
      feePayment: {
        OutPoint: transferFeeOutPoint,
        Owner: fixture.bob,
      },
      destinations: [
        {
          Satoshis: transferredStasOutPoint.Satoshis,
          To: fixture.alice.Address,
          Frozen: false,
        },
      ],
      Scheme: fixture.scheme,
    });

    const confiscateEval = evaluateTransactionHex(
      confiscateTxHex,
      strictResolverFromTxHexes(transferTxHex, fixture.issueTxHex),
      { allowOpReturn: true },
    );

    expect(confiscateEval.success).toBe(true);
    expect(confiscateEval.inputs.find((x) => x.inputIndex === 0)?.success).toBe(
      true,
    );
    expect(confiscateEval.inputs.find((x) => x.inputIndex === 1)?.success).toBe(
      true,
    );
  });

  test("real funding: swap-marked -> freeze -> confiscate is valid", () => {
    const fixture = createRealFundingFlowFixture();
    const swapActionData = buildSwapActionData({
      requestedScriptHash: fromHex("11".repeat(32)),
      requestedPkh: fixture.bob.Address.Hash160,
      rateNumerator: 1,
      rateDenominator: 1,
    });

    const swapTxHex = BuildDstasSwapTx({
      stasPayments: [
        {
          OutPoint: fixture.stasOutPoint,
          Owner: fixture.alice,
        },
      ],
      feePayment: {
        OutPoint: fixture.feeOutPoint,
        Owner: fixture.bob,
      },
      destinations: [
        {
          Satoshis: fixture.stasOutPoint.Satoshis,
          To: fixture.alice.Address,
          ActionData: swapActionData,
        },
      ],
      Scheme: fixture.scheme,
    });
    const swapTx = TransactionReader.readHex(swapTxHex);

    const swapMarkedOutPoint = new OutPoint(
      swapTx.Id,
      0,
      swapTx.Outputs[0].LockingScript,
      swapTx.Outputs[0].Satoshis,
      fixture.alice.Address,
      ScriptType.dstas,
    );
    const freezeTxHex = BuildDstasFreezeTx({
      stasPayments: [
        {
          OutPoint: swapMarkedOutPoint,
          Owner: fixture.cat,
        },
      ],
      feePayment: {
        OutPoint: fixture.feeOutPoint,
        Owner: fixture.bob,
      },
      destinations: [
        {
          Satoshis: swapMarkedOutPoint.Satoshis,
          To: fixture.alice.Address,
          ActionData: swapActionData,
          Frozen: true,
        },
      ],
      Scheme: fixture.scheme,
    });
    const freezeTx = TransactionReader.readHex(freezeTxHex);

    const frozenSwapOutPoint = new OutPoint(
      freezeTx.Id,
      0,
      freezeTx.Outputs[0].LockingScript,
      freezeTx.Outputs[0].Satoshis,
      fixture.alice.Address,
      ScriptType.dstas,
    );

    const confiscateTxHex = BuildDstasConfiscateTx({
      stasPayments: [
        {
          OutPoint: frozenSwapOutPoint,
          Owner: fixture.cat,
        },
      ],
      feePayment: {
        OutPoint: fixture.feeOutPoint,
        Owner: fixture.bob,
      },
      destinations: [
        {
          Satoshis: frozenSwapOutPoint.Satoshis,
          To: fixture.bob.Address,
          ActionData: swapActionData,
          Frozen: false,
        },
      ],
      Scheme: fixture.scheme,
    });

    const confiscateEval = evaluateTransactionHex(
      confiscateTxHex,
      strictResolverFromTxHexes(freezeTxHex, swapTxHex, fixture.issueTxHex),
      { allowOpReturn: true },
    );

    expect(confiscateEval.success).toBe(true);
    expect(confiscateEval.inputs.find((x) => x.inputIndex === 0)?.success).toBe(
      true,
    );
    expect(confiscateEval.inputs.find((x) => x.inputIndex === 1)?.success).toBe(
      true,
    );
  });

  test("real funding: confiscate without authority rights is rejected", () => {
    const fixture = createRealFundingFlowFixture();

    const confiscateTxHex = BuildDstasConfiscateTx({
      stasPayments: [
        {
          OutPoint: fixture.stasOutPoint,
          // Non-authority signer.
          Owner: fixture.alice,
        },
      ],
      feePayment: {
        OutPoint: fixture.feeOutPoint,
        Owner: fixture.bob,
      },
      destinations: [
        {
          Satoshis: fixture.stasOutPoint.Satoshis,
          To: fixture.bob.Address,
          Frozen: false,
        },
      ],
      Scheme: fixture.scheme,
    });

    const confiscateEval = evaluateTransactionHex(
      confiscateTxHex,
      resolveFromTx(fixture.issueTxHex),
      { allowOpReturn: true },
    );

    expect(confiscateEval.success).toBe(false);
    expect(confiscateEval.inputs.find((x) => x.inputIndex === 0)?.success).toBe(
      false,
    );
  });

  test("real funding: confiscate is rejected when scheme has no confiscation flag", () => {
    const bob = Wallet.fromMnemonic(
      "group spy extend supreme monkey judge avocado cancel exit educate modify bubble",
    ).deriveWallet("m/44'/236'/0'/0/0");
    const cat = Wallet.fromMnemonic(
      "group spy extend supreme monkey judge avocado cancel exit educate modify bubble",
    ).deriveWallet("m/44'/236'/0'/0/1");
    const alice = Wallet.fromMnemonic(
      "group spy extend supreme monkey judge avocado cancel exit educate modify bubble",
    ).deriveWallet("m/44'/236'/0'/0/2");

    const schemeNoConfiscation = new TokenScheme(
      "Divisible STAS (no confiscation)",
      toHex(bob.Address.Hash160),
      "S30NC",
      1,
      {
        freeze: true,
        confiscation: false,
        isDivisible: true,
        freezeAuthority: { m: 1, publicKeys: [toHex(cat.PublicKey)] },
        confiscationAuthority: { m: 1, publicKeys: [toHex(cat.PublicKey)] },
      },
    );

    const sourceFunding = createRealFundingOutPoint(bob);
    const { issueTxHex } = BuildDstasIssueTxs({
      fundingPayment: {
        OutPoint: sourceFunding,
        Owner: bob,
      },
      scheme: schemeNoConfiscation,
      destinations: [{ Satoshis: 100, To: alice.Address }],
    });
    const issueTx = TransactionReader.readHex(issueTxHex);

    const stasOutPoint = new OutPoint(
      issueTx.Id,
      0,
      issueTx.Outputs[0].LockingScript,
      issueTx.Outputs[0].Satoshis,
      alice.Address,
      ScriptType.dstas,
    );
    const feeOutPoint = new OutPoint(
      issueTx.Id,
      1,
      issueTx.Outputs[1].LockingScript,
      issueTx.Outputs[1].Satoshis,
      bob.Address,
      ScriptType.p2pkh,
    );

    const confiscateTxHex = BuildDstasConfiscateTx({
      stasPayments: [
        {
          OutPoint: stasOutPoint,
          Owner: cat,
        },
      ],
      feePayment: {
        OutPoint: feeOutPoint,
        Owner: bob,
      },
      destinations: [
        {
          Satoshis: stasOutPoint.Satoshis,
          To: bob.Address,
          Frozen: false,
        },
      ],
      Scheme: schemeNoConfiscation,
    });

    const confiscateEval = evaluateTransactionHex(
      confiscateTxHex,
      resolveFromTx(issueTxHex),
      { allowOpReturn: true },
    );

    expect(confiscateEval.success).toBe(false);
    expect(confiscateEval.inputs.find((x) => x.inputIndex === 0)?.success).toBe(
      false,
    );
  });

  test("real funding: confiscated output is spendable by new owner", () => {
    const fixture = createRealFundingFlowFixture();

    const confiscateTxHex = BuildDstasConfiscateTx({
      stasPayments: [
        {
          OutPoint: fixture.stasOutPoint,
          Owner: fixture.cat,
        },
      ],
      feePayment: {
        OutPoint: fixture.feeOutPoint,
        Owner: fixture.bob,
      },
      destinations: [
        {
          Satoshis: fixture.stasOutPoint.Satoshis,
          To: fixture.bob.Address,
          Frozen: false,
        },
      ],
      Scheme: fixture.scheme,
    });
    const confiscateTx = TransactionReader.readHex(confiscateTxHex);

    const confiscatedStasOutPoint = new OutPoint(
      confiscateTx.Id,
      0,
      confiscateTx.Outputs[0].LockingScript,
      confiscateTx.Outputs[0].Satoshis,
      fixture.bob.Address,
      ScriptType.dstas,
    );
    const confiscateFeeOutPoint = new OutPoint(
      confiscateTx.Id,
      1,
      confiscateTx.Outputs[1].LockingScript,
      confiscateTx.Outputs[1].Satoshis,
      fixture.bob.Address,
      ScriptType.p2pkh,
    );

    const transferAfterConfiscationTxHex = BuildDstasTransferTx({
      stasPayment: {
        OutPoint: confiscatedStasOutPoint,
        Owner: fixture.bob,
      },
      feePayment: {
        OutPoint: confiscateFeeOutPoint,
        Owner: fixture.bob,
      },
      Scheme: fixture.scheme,
      destination: {
        Satoshis: confiscatedStasOutPoint.Satoshis,
        To: fixture.alice.Address,
      },
      omitChangeOutput: true,
    });

    const transferAfterConfiscationEval = evaluateTransactionHex(
      transferAfterConfiscationTxHex,
      resolveFromTx(confiscateTxHex),
      { allowOpReturn: true },
    );

    expect(transferAfterConfiscationEval.success).toBe(true);
    expect(
      transferAfterConfiscationEval.inputs.find((x) => x.inputIndex === 0)
        ?.success,
    ).toBe(true);
  });

  test("real funding: unfreeze flow is valid", () => {
    const fixture = createRealFundingFlowFixture();
    const freezeTxHex = buildFreezeFromFixture(fixture);
    const freezeTx = TransactionReader.readHex(freezeTxHex);

    const frozenStasOutPoint = new OutPoint(
      freezeTx.Id,
      0,
      freezeTx.Outputs[0].LockingScript,
      freezeTx.Outputs[0].Satoshis,
      fixture.alice.Address,
      ScriptType.dstas,
    );

    const feeOutPoint = new OutPoint(
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
      freezeTx.Outputs[0].LockingScript,
      freezeTx.Outputs[0].Satoshis,
      fixture.alice.Address,
      ScriptType.dstas,
    );

    const freezeFeeOutPoint = new OutPoint(
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
      unfreezeTx.Outputs[0].LockingScript,
      unfreezeTx.Outputs[0].Satoshis,
      fixture.alice.Address,
      ScriptType.dstas,
    );
    const unfreezeFeeOutPoint = new OutPoint(
      unfreezeTx.Id,
      1,
      unfreezeTx.Outputs[1].LockingScript,
      unfreezeTx.Outputs[1].Satoshis,
      fixture.bob.Address,
      ScriptType.p2pkh,
    );

    const spendUnfrozenTxHex = BuildDstasTransferTx({
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

  test("real funding: theft attempt fails when non-owner signs STAS input", () => {
    const fixture = createRealFundingFlowFixture();

    const stolenStasTxHex = BuildDstasTransferTx({
      stasPayment: {
        OutPoint: fixture.stasOutPoint,
        // Attacker tries to spend Alice-owned STAS.
        Owner: fixture.bob,
      },
      feePayment: {
        OutPoint: fixture.feeOutPoint,
        Owner: fixture.bob,
      },
      Scheme: fixture.scheme,
      destination: {
        Satoshis: fixture.stasOutPoint.Satoshis,
        To: fixture.bob.Address,
      },
      omitChangeOutput: true,
    });

    const stolenEval = evaluateTransactionHex(
      stolenStasTxHex,
      resolveFromTx(fixture.issueTxHex),
      { allowOpReturn: true },
    );

    expect(stolenEval.success).toBe(false);
    expect(stolenEval.inputs.find((x) => x.inputIndex === 0)?.success).toBe(
      false,
    );
  });

  test("real funding: theft attempt fails when non-owner signs fee input", () => {
    const fixture = createRealFundingFlowFixture();

    const stolenFeeTxHex = BuildDstasTransferTx({
      stasPayment: {
        OutPoint: fixture.stasOutPoint,
        Owner: fixture.alice,
      },
      feePayment: {
        OutPoint: fixture.feeOutPoint,
        // Attacker tries to spend Bob-owned fee UTXO.
        Owner: fixture.cat,
      },
      Scheme: fixture.scheme,
      destination: {
        Satoshis: fixture.stasOutPoint.Satoshis,
        To: fixture.bob.Address,
      },
      omitChangeOutput: true,
    });

    const stolenEval = evaluateTransactionHex(
      stolenFeeTxHex,
      resolveFromTx(fixture.issueTxHex),
      { allowOpReturn: true },
    );

    expect(stolenEval.success).toBe(false);
    expect(stolenEval.inputs.find((x) => x.inputIndex === 1)?.success).toBe(
      false,
    );
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

  test("real funding: issuer cannot redeem frozen utxo", () => {
    const fixture = createRealFundingFlowFixture();

    const transferToIssuerTxHex = BuildDstasTransferTx({
      stasPayment: {
        OutPoint: fixture.stasOutPoint,
        Owner: fixture.alice,
      },
      feePayment: {
        OutPoint: fixture.feeOutPoint,
        Owner: fixture.bob,
      },
      Scheme: fixture.scheme,
      destination: {
        Satoshis: fixture.stasOutPoint.Satoshis,
        To: fixture.bob.Address,
      },
    });
    const transferToIssuerTx = TransactionReader.readHex(transferToIssuerTxHex);

    const issuerStasOutPoint = new OutPoint(
      transferToIssuerTx.Id,
      0,
      transferToIssuerTx.Outputs[0].LockingScript,
      transferToIssuerTx.Outputs[0].Satoshis,
      fixture.bob.Address,
      ScriptType.dstas,
    );
    const issuerFeeOutPoint = new OutPoint(
      transferToIssuerTx.Id,
      1,
      transferToIssuerTx.Outputs[1].LockingScript,
      transferToIssuerTx.Outputs[1].Satoshis,
      fixture.bob.Address,
      ScriptType.p2pkh,
    );

    const freezeIssuerUtxoTxHex = BuildDstasFreezeTx({
      stasPayments: [
        {
          OutPoint: issuerStasOutPoint,
          Owner: fixture.cat,
        },
      ],
      feePayment: {
        OutPoint: issuerFeeOutPoint,
        Owner: fixture.bob,
      },
      destinations: [
        {
          Satoshis: issuerStasOutPoint.Satoshis,
          To: fixture.bob.Address,
          Frozen: true,
        },
      ],
      Scheme: fixture.scheme,
    });
    const freezeIssuerUtxoTx = TransactionReader.readHex(freezeIssuerUtxoTxHex);

    const frozenIssuerStasOutPoint = new OutPoint(
      freezeIssuerUtxoTx.Id,
      0,
      freezeIssuerUtxoTx.Outputs[0].LockingScript,
      freezeIssuerUtxoTx.Outputs[0].Satoshis,
      fixture.bob.Address,
      ScriptType.dstas,
    );
    const redeemTxHex = buildRedeemTx({
      stasOutPoint: frozenIssuerStasOutPoint,
      stasOwner: fixture.bob,
      feeOutPoint: issuerFeeOutPoint,
      feeOwner: fixture.bob,
      redeemAddress: fixture.bob.Address,
    });

    const redeemEval = evaluateTransactionHex(
      redeemTxHex,
      (txId, vout) =>
        resolveFromTx(freezeIssuerUtxoTxHex)(txId, vout) ??
        resolveFromTx(transferToIssuerTxHex)(txId, vout) ??
        resolveFromTx(fixture.issueTxHex)(txId, vout),
      { allowOpReturn: true },
    );

    expect(redeemEval.success).toBe(false);
    expect(redeemEval.inputs.find((x) => x.inputIndex === 0)?.success).toBe(
      false,
    );
  });

  test("real funding: issuer cannot redeem with confiscation spending type", () => {
    const fixture = createRealFundingFlowFixture();

    const transferToIssuerTxHex = BuildDstasTransferTx({
      stasPayment: {
        OutPoint: fixture.stasOutPoint,
        Owner: fixture.alice,
      },
      feePayment: {
        OutPoint: fixture.feeOutPoint,
        Owner: fixture.bob,
      },
      Scheme: fixture.scheme,
      destination: {
        Satoshis: fixture.stasOutPoint.Satoshis,
        To: fixture.bob.Address,
      },
    });
    const transferToIssuerTx = TransactionReader.readHex(transferToIssuerTxHex);

    const issuerStasOutPoint = new OutPoint(
      transferToIssuerTx.Id,
      0,
      transferToIssuerTx.Outputs[0].LockingScript,
      transferToIssuerTx.Outputs[0].Satoshis,
      fixture.bob.Address,
      ScriptType.dstas,
    );
    const issuerFeeOutPoint = new OutPoint(
      transferToIssuerTx.Id,
      1,
      transferToIssuerTx.Outputs[1].LockingScript,
      transferToIssuerTx.Outputs[1].Satoshis,
      fixture.bob.Address,
      ScriptType.p2pkh,
    );

    const redeemTxHex = buildRedeemTx({
      stasOutPoint: issuerStasOutPoint,
      stasOwner: fixture.bob,
      feeOutPoint: issuerFeeOutPoint,
      feeOwner: fixture.bob,
      redeemAddress: fixture.bob.Address,
      spendingType: 3,
    });

    const redeemEval = evaluateTransactionHex(
      redeemTxHex,
      strictResolverFromTxHexes(transferToIssuerTxHex, fixture.issueTxHex),
      { allowOpReturn: true },
    );

    expect(redeemEval.success).toBe(false);
    expect(redeemEval.inputs.find((x) => x.inputIndex === 0)?.success).toBe(
      false,
    );
  });

  test("real funding: issuer can redeem after receiving token", () => {
    const fixture = createRealFundingFlowFixture();

    const transferToIssuerTxHex = BuildDstasTransferTx({
      stasPayment: {
        OutPoint: fixture.stasOutPoint,
        Owner: fixture.alice,
      },
      feePayment: {
        OutPoint: fixture.feeOutPoint,
        Owner: fixture.bob,
      },
      Scheme: fixture.scheme,
      destination: {
        Satoshis: fixture.stasOutPoint.Satoshis,
        To: fixture.bob.Address,
      },
    });

    const transferToIssuerTx = TransactionReader.readHex(transferToIssuerTxHex);
    const issuerStasOutPoint = new OutPoint(
      transferToIssuerTx.Id,
      0,
      transferToIssuerTx.Outputs[0].LockingScript,
      transferToIssuerTx.Outputs[0].Satoshis,
      fixture.bob.Address,
      ScriptType.dstas,
    );
    const issuerFeeOutPoint = new OutPoint(
      transferToIssuerTx.Id,
      1,
      transferToIssuerTx.Outputs[1].LockingScript,
      transferToIssuerTx.Outputs[1].Satoshis,
      fixture.bob.Address,
      ScriptType.p2pkh,
    );

    const redeemTxHex = buildRedeemTx({
      stasOutPoint: issuerStasOutPoint,
      stasOwner: fixture.bob,
      feeOutPoint: issuerFeeOutPoint,
      feeOwner: fixture.bob,
      redeemAddress: fixture.bob.Address,
    });

    const redeemEval = evaluateTransactionHex(
      redeemTxHex,
      (txId, vout) =>
        resolveFromTx(transferToIssuerTxHex)(txId, vout) ??
        resolveFromTx(fixture.issueTxHex)(txId, vout),
      { allowOpReturn: true },
    );

    expect(redeemEval.success).toBe(true);
    expect(redeemEval.inputs.find((x) => x.inputIndex === 0)?.success).toBe(
      true,
    );
    expect(redeemEval.inputs.find((x) => x.inputIndex === 1)?.success).toBe(
      true,
    );
  });

  test("real funding: issue -> transfer -> freeze -> unfreeze -> redeem is valid", () => {
    const fixture = createRealFundingFlowFixture();

    const transferTxHex = BuildDstasTransferTx({
      stasPayment: {
        OutPoint: fixture.stasOutPoint,
        Owner: fixture.alice,
      },
      feePayment: {
        OutPoint: fixture.feeOutPoint,
        Owner: fixture.bob,
      },
      Scheme: fixture.scheme,
      destination: {
        Satoshis: fixture.stasOutPoint.Satoshis,
        To: fixture.bob.Address,
      },
    });
    const transferTx = TransactionReader.readHex(transferTxHex);
    const transferredStasOutPoint = new OutPoint(
      transferTx.Id,
      0,
      transferTx.Outputs[0].LockingScript,
      transferTx.Outputs[0].Satoshis,
      fixture.bob.Address,
      ScriptType.dstas,
    );
    const transferEval = evaluateTransactionHex(
      transferTxHex,
      resolveFromTx(fixture.issueTxHex),
      { allowOpReturn: true },
    );

    const freezeTxHex = BuildDstasFreezeTx({
      stasPayments: [
        {
          OutPoint: transferredStasOutPoint,
          Owner: fixture.cat,
        },
      ],
      feePayment: {
        OutPoint: fixture.feeOutPoint,
        Owner: fixture.bob,
      },
      destinations: [
        {
          Satoshis: transferredStasOutPoint.Satoshis,
          To: fixture.bob.Address,
          Frozen: true,
        },
      ],
      Scheme: fixture.scheme,
    });
    const freezeTx = TransactionReader.readHex(freezeTxHex);
    const frozenStasOutPoint = new OutPoint(
      freezeTx.Id,
      0,
      freezeTx.Outputs[0].LockingScript,
      freezeTx.Outputs[0].Satoshis,
      fixture.bob.Address,
      ScriptType.dstas,
    );
    const freezeEval = evaluateTransactionHex(
      freezeTxHex,
      strictResolverFromTxHexes(transferTxHex, fixture.issueTxHex),
      { allowOpReturn: true },
    );

    const unfreezeTxHex = BuildDstasUnfreezeTx({
      stasPayments: [
        {
          OutPoint: frozenStasOutPoint,
          Owner: fixture.cat,
        },
      ],
      feePayment: {
        OutPoint: fixture.feeOutPoint,
        Owner: fixture.bob,
      },
      destinations: [
        {
          Satoshis: frozenStasOutPoint.Satoshis,
          To: fixture.bob.Address,
          Frozen: false,
        },
      ],
      Scheme: fixture.scheme,
    });
    const unfreezeTx = TransactionReader.readHex(unfreezeTxHex);
    const unfrozenStasOutPoint = new OutPoint(
      unfreezeTx.Id,
      0,
      unfreezeTx.Outputs[0].LockingScript,
      unfreezeTx.Outputs[0].Satoshis,
      fixture.bob.Address,
      ScriptType.dstas,
    );
    const unfreezeEval = evaluateTransactionHex(
      unfreezeTxHex,
      strictResolverFromTxHexes(freezeTxHex, transferTxHex, fixture.issueTxHex),
      { allowOpReturn: true },
    );

    const redeemTxHex = buildRedeemTx({
      stasOutPoint: unfrozenStasOutPoint,
      stasOwner: fixture.bob,
      feeOutPoint: fixture.feeOutPoint,
      feeOwner: fixture.bob,
      redeemAddress: fixture.bob.Address,
    });
    const redeemEval = evaluateTransactionHex(
      redeemTxHex,
      strictResolverFromTxHexes(
        unfreezeTxHex,
        freezeTxHex,
        transferTxHex,
        fixture.issueTxHex,
      ),
      { allowOpReturn: true },
    );

    expect(transferEval.success).toBe(true);
    expect(freezeEval.success).toBe(true);
    expect(unfreezeEval.success).toBe(true);
    expect(redeemEval.success).toBe(true);
  });
});
