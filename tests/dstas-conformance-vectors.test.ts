import {
  Address,
  OutPoint,
  ScriptType,
  TokenScheme,
  Wallet,
} from "../src/bitcoin";
import { PrivateKey } from "../src/bitcoin/private-key";
import { toHex } from "../src/bytes";
import {
  BuildDstasConfiscateTx,
  BuildDstasFreezeTx,
  BuildDstasIssueTxs,
  BuildDstasSwapTx,
  BuildDstasTransferTx,
  BuildDstasUnfreezeTx,
} from "../src/dstas-factory";
import {
  evaluateTransactionHex,
  ResolvePrevOutput,
  TransactionEvalResult,
  buildSwapActionData,
} from "../src/script";
import { FeeRate } from "../src/transaction-factory";
import { TransactionBuilder } from "../src/transaction/build/transaction-builder";
import { TransactionReader } from "../src/transaction/read/transaction-reader";
import {
  createRealFundingFlowFixture,
  createRealFundingOutPoint,
  mnemonic,
} from "./helpers/dstas-flow-helpers";

const resolveFromTx = (txHex: string): ResolvePrevOutput => {
  const tx = TransactionReader.readHex(txHex);
  return (txId: string, vout: number) => {
    if (txId !== tx.Id) return undefined;
    const out = tx.Outputs[vout];
    if (!out) return undefined;
    return { lockingScript: out.LockignScript, satoshis: out.Satoshis };
  };
};

const strictResolverFromTxHexes =
  (...txHexes: string[]): ResolvePrevOutput =>
  (txId: string, vout: number) => {
    for (const txHex of txHexes) {
      const prev = resolveFromTx(txHex)(txId, vout);
      if (prev) return prev;
    }
    return undefined;
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
  redeemAddress: Address;
  spendingType?: number;
}) => {
  const txBuilder = TransactionBuilder.init()
    .addInput(stasOutPoint, stasOwner)
    .addInput(feeOutPoint, feeOwner)
    .addP2MpkhOutput(stasOutPoint.Satoshis, redeemAddress);

  const feeOutputIdx = txBuilder.Outputs.length;
  txBuilder.Inputs[0].DstasSpendingType = spendingType;

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

type ConformanceVector = {
  id: string;
  expectedSuccess: boolean;
  failedInputs?: number[];
  run: () => TransactionEvalResult;
};

const vectors: ConformanceVector[] = [
  {
    id: "transfer_regular_valid",
    expectedSuccess: true,
    run: () => {
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
      return evaluateTransactionHex(
        transferTxHex,
        resolveFromTx(fixture.issueTxHex),
        {
          allowOpReturn: true,
        },
      );
    },
  },
  {
    id: "freeze_valid",
    expectedSuccess: true,
    run: () => {
      const fixture = createRealFundingFlowFixture();
      const freezeTxHex = BuildDstasFreezeTx({
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
            To: fixture.alice.Address,
            Frozen: true,
          },
        ],
        Scheme: fixture.scheme,
      });
      return evaluateTransactionHex(
        freezeTxHex,
        resolveFromTx(fixture.issueTxHex),
        {
          allowOpReturn: true,
        },
      );
    },
  },
  {
    id: "frozen_owner_spend_rejected",
    expectedSuccess: false,
    failedInputs: [0],
    run: () => {
      const fixture = createRealFundingFlowFixture();
      const freezeTxHex = BuildDstasFreezeTx({
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
            To: fixture.alice.Address,
            Frozen: true,
          },
        ],
        Scheme: fixture.scheme,
      });
      const freezeTx = TransactionReader.readHex(freezeTxHex);

      const frozenStasOutPoint = new OutPoint(
        freezeTx.Id,
        0,
        freezeTx.Outputs[0].LockignScript,
        freezeTx.Outputs[0].Satoshis,
        fixture.alice.Address,
        ScriptType.dstas,
      );
      const frozenFeeOutPoint = new OutPoint(
        freezeTx.Id,
        1,
        freezeTx.Outputs[1].LockignScript,
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
          OutPoint: frozenFeeOutPoint,
          Owner: fixture.bob,
        },
        Scheme: fixture.scheme,
        destination: {
          Satoshis: frozenStasOutPoint.Satoshis,
          To: fixture.bob.Address,
        },
      });

      return evaluateTransactionHex(
        spendFrozenTxHex,
        resolveFromTx(freezeTxHex),
        {
          allowOpReturn: true,
        },
      );
    },
  },
  {
    id: "unfreeze_valid",
    expectedSuccess: true,
    run: () => {
      const fixture = createRealFundingFlowFixture();
      const freezeTxHex = BuildDstasFreezeTx({
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
            To: fixture.alice.Address,
            Frozen: true,
          },
        ],
        Scheme: fixture.scheme,
      });
      const freezeTx = TransactionReader.readHex(freezeTxHex);

      const frozenStasOutPoint = new OutPoint(
        freezeTx.Id,
        0,
        freezeTx.Outputs[0].LockignScript,
        freezeTx.Outputs[0].Satoshis,
        fixture.alice.Address,
        ScriptType.dstas,
      );
      const frozenFeeOutPoint = new OutPoint(
        freezeTx.Id,
        1,
        freezeTx.Outputs[1].LockignScript,
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
        Scheme: fixture.scheme,
      });

      return evaluateTransactionHex(unfreezeTxHex, resolveFromTx(freezeTxHex), {
        allowOpReturn: true,
      });
    },
  },
  {
    id: "confiscate_valid",
    expectedSuccess: true,
    run: () => {
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
        transferTx.Outputs[0].LockignScript,
        transferTx.Outputs[0].Satoshis,
        fixture.bob.Address,
        ScriptType.dstas,
      );

      const confiscateTxHex = BuildDstasConfiscateTx({
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
            To: fixture.alice.Address,
            Frozen: false,
          },
        ],
        Scheme: fixture.scheme,
      });

      return evaluateTransactionHex(
        confiscateTxHex,
        strictResolverFromTxHexes(transferTxHex, fixture.issueTxHex),
        { allowOpReturn: true },
      );
    },
  },
  {
    id: "confiscate_without_authority_rejected",
    expectedSuccess: false,
    failedInputs: [0],
    run: () => {
      const fixture = createRealFundingFlowFixture();
      const confiscateTxHex = BuildDstasConfiscateTx({
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
            To: fixture.bob.Address,
            Frozen: false,
          },
        ],
        Scheme: fixture.scheme,
      });
      return evaluateTransactionHex(
        confiscateTxHex,
        resolveFromTx(fixture.issueTxHex),
        {
          allowOpReturn: true,
        },
      );
    },
  },
  {
    id: "confiscate_without_bit2_rejected",
    expectedSuccess: false,
    failedInputs: [0],
    run: () => {
      const bob =
        Wallet.fromMnemonic(mnemonic).deriveWallet("m/44'/236'/0'/0/0");
      const cat =
        Wallet.fromMnemonic(mnemonic).deriveWallet("m/44'/236'/0'/0/1");
      const alice =
        Wallet.fromMnemonic(mnemonic).deriveWallet("m/44'/236'/0'/0/2");

      const schemeNoConfiscation = new TokenScheme(
        "Divisible STAS (no confiscation)",
        toHex(bob.Address.Hash160),
        "S30NC",
        1,
        {
          freeze: true,
          confiscation: false,
          isDivisible: true,
          authority: { m: 1, publicKeys: [toHex(cat.PublicKey)] },
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
        issueTx.Outputs[0].LockignScript,
        issueTx.Outputs[0].Satoshis,
        alice.Address,
        ScriptType.dstas,
      );
      const feeOutPoint = new OutPoint(
        issueTx.Id,
        1,
        issueTx.Outputs[1].LockignScript,
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

      return evaluateTransactionHex(
        confiscateTxHex,
        resolveFromTx(issueTxHex),
        {
          allowOpReturn: true,
        },
      );
    },
  },
  {
    id: "redeem_by_issuer_valid",
    expectedSuccess: true,
    run: () => {
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
      const transferToIssuerTx = TransactionReader.readHex(
        transferToIssuerTxHex,
      );
      const issuerStasOutPoint = new OutPoint(
        transferToIssuerTx.Id,
        0,
        transferToIssuerTx.Outputs[0].LockignScript,
        transferToIssuerTx.Outputs[0].Satoshis,
        fixture.bob.Address,
        ScriptType.dstas,
      );
      const issuerFeeOutPoint = new OutPoint(
        transferToIssuerTx.Id,
        1,
        transferToIssuerTx.Outputs[1].LockignScript,
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
      return evaluateTransactionHex(
        redeemTxHex,
        strictResolverFromTxHexes(transferToIssuerTxHex, fixture.issueTxHex),
        { allowOpReturn: true },
      );
    },
  },
  {
    id: "redeem_by_non_issuer_rejected",
    expectedSuccess: false,
    failedInputs: [0],
    run: () => {
      const fixture = createRealFundingFlowFixture();
      const redeemTxHex = buildRedeemTx({
        stasOutPoint: fixture.stasOutPoint,
        stasOwner: fixture.alice,
        feeOutPoint: fixture.feeOutPoint,
        feeOwner: fixture.bob,
        redeemAddress: fixture.bob.Address,
      });
      return evaluateTransactionHex(
        redeemTxHex,
        resolveFromTx(fixture.issueTxHex),
        {
          allowOpReturn: true,
        },
      );
    },
  },
  {
    id: "redeem_frozen_rejected",
    expectedSuccess: false,
    failedInputs: [0],
    run: () => {
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
      const transferToIssuerTx = TransactionReader.readHex(
        transferToIssuerTxHex,
      );
      const issuerStasOutPoint = new OutPoint(
        transferToIssuerTx.Id,
        0,
        transferToIssuerTx.Outputs[0].LockignScript,
        transferToIssuerTx.Outputs[0].Satoshis,
        fixture.bob.Address,
        ScriptType.dstas,
      );
      const issuerFeeOutPoint = new OutPoint(
        transferToIssuerTx.Id,
        1,
        transferToIssuerTx.Outputs[1].LockignScript,
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
      const freezeIssuerTx = TransactionReader.readHex(freezeIssuerUtxoTxHex);
      const frozenIssuerStasOutPoint = new OutPoint(
        freezeIssuerTx.Id,
        0,
        freezeIssuerTx.Outputs[0].LockignScript,
        freezeIssuerTx.Outputs[0].Satoshis,
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
      return evaluateTransactionHex(
        redeemTxHex,
        strictResolverFromTxHexes(
          freezeIssuerUtxoTxHex,
          transferToIssuerTxHex,
          fixture.issueTxHex,
        ),
        { allowOpReturn: true },
      );
    },
  },
  {
    id: "redeem_confiscation_spending_type_rejected",
    expectedSuccess: false,
    failedInputs: [0],
    run: () => {
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
      const transferToIssuerTx = TransactionReader.readHex(
        transferToIssuerTxHex,
      );

      const issuerStasOutPoint = new OutPoint(
        transferToIssuerTx.Id,
        0,
        transferToIssuerTx.Outputs[0].LockignScript,
        transferToIssuerTx.Outputs[0].Satoshis,
        fixture.bob.Address,
        ScriptType.dstas,
      );
      const issuerFeeOutPoint = new OutPoint(
        transferToIssuerTx.Id,
        1,
        transferToIssuerTx.Outputs[1].LockignScript,
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
      return evaluateTransactionHex(
        redeemTxHex,
        strictResolverFromTxHexes(transferToIssuerTxHex, fixture.issueTxHex),
        { allowOpReturn: true },
      );
    },
  },
  {
    id: "swap_cancel_valid",
    expectedSuccess: true,
    run: () => {
      const fixture = createRealFundingFlowFixture();
      const swapSecondField = buildSwapActionData({
        requestedScriptHash: new Uint8Array(32),
        requestedPkh: fixture.bob.Address.Hash160,
        rateNumerator: 0,
        rateDenominator: 0,
      });

      const { issueTxHex } = BuildDstasIssueTxs({
        fundingPayment: {
          OutPoint: fixture.sourceFunding,
          Owner: fixture.bob,
        },
        scheme: fixture.scheme,
        destinations: [
          {
            Satoshis: 100,
            To: fixture.bob.Address,
            ActionData: swapSecondField,
          },
        ],
      });
      const issueTx = TransactionReader.readHex(issueTxHex);

      const stasOutPoint = new OutPoint(
        issueTx.Id,
        0,
        issueTx.Outputs[0].LockignScript,
        issueTx.Outputs[0].Satoshis,
        fixture.bob.Address,
        ScriptType.dstas,
      );
      const feeOutPoint = new OutPoint(
        issueTx.Id,
        1,
        issueTx.Outputs[1].LockignScript,
        issueTx.Outputs[1].Satoshis,
        fixture.bob.Address,
        ScriptType.p2pkh,
      );

      const swapTxHex = BuildDstasSwapTx({
        stasPayments: [
          {
            OutPoint: stasOutPoint,
            Owner: fixture.bob,
          },
        ],
        feePayment: {
          OutPoint: feeOutPoint,
          Owner: fixture.bob,
        },
        destinations: [
          {
            Satoshis: stasOutPoint.Satoshis,
            To: fixture.bob.Address,
            ActionData: swapSecondField,
          },
        ],
        Scheme: fixture.scheme,
        omitChangeOutput: true,
      });
      return evaluateTransactionHex(swapTxHex, resolveFromTx(issueTxHex), {
        allowOpReturn: true,
      });
    },
  },
];

describe("dstas conformance vectors", () => {
  test.each(vectors)("$id", (vector) => {
    const result = vector.run();

    expect(result.success).toBe(vector.expectedSuccess);
    if (vector.expectedSuccess) {
      for (const inputResult of result.inputs) {
        expect(inputResult.success).toBe(true);
      }
      return;
    }

    if (!vector.failedInputs || vector.failedInputs.length === 0) return;
    for (const inputIndex of vector.failedInputs) {
      expect(
        result.inputs.find((x) => x.inputIndex === inputIndex)?.success,
      ).toBe(false);
    }
  });
});
