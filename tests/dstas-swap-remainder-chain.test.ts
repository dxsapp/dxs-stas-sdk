import { expect } from "@jest/globals";
import { OutPoint, ScriptType, Wallet } from "../src/bitcoin";
import { toHex } from "../src/bytes";
import {
  buildSwapActionData,
  computeDstasRequestedScriptHash,
  decomposeDstasLockingScript,
  evaluateTransactionHex,
} from "../src/script";
import { TransactionReader } from "../src/transaction/read/transaction-reader";
import {
  BuildDstasIssueTxs,
  BuildDstasTransferSwapTx,
} from "../src/dstas-factory";
import { FeeRate } from "../src/transaction-factory";
import { hash160 } from "../src/hashes";
import { P2pkhBuilder } from "../src/script/build/p2pkh-builder";
import { createPrevOutputResolverFromTransactions } from "../src/script/eval/script-evaluator";
import { createDefaultDstasScheme } from "./helpers/dstas-flow-helpers";
import { swapDestination as swapDestinationForFlow } from "./helpers/dstas-flow-shared";

type TResolverState = {
  txMap: Map<string, ReturnType<typeof TransactionReader.readHex>>;
  syntheticPrevouts: Map<
    string,
    { lockingScript: Uint8Array; satoshis: number }
  >;
};

const makeSyntheticFundingOutPoint = (
  wallet: Wallet,
  txIdPrefix: string,
  satoshis = 1_935,
) =>
  new OutPoint(
    txIdPrefix.repeat(32),
    0,
    new P2pkhBuilder(wallet.Address).toBytes(),
    satoshis,
    wallet.Address,
    ScriptType.p2pkh,
  );

const resolverKey = (txId: string, vout: number) => `${txId}:${vout}`;

const createResolver = (state: TResolverState) => {
  const txResolver = createPrevOutputResolverFromTransactions(state.txMap);

  return (txId: string, vout: number) => {
    const synthetic = state.syntheticPrevouts.get(resolverKey(txId, vout));
    if (synthetic) return synthetic;
    return txResolver(txId, vout);
  };
};

const storeTx = (state: TResolverState, txHex: string) => {
  const tx = TransactionReader.readHex(txHex);
  state.txMap.set(tx.Id, tx);
  return tx;
};

const assertTxValid = (
  state: TResolverState,
  txHex: string,
  label?: string,
) => {
  const result = evaluateTransactionHex(txHex, createResolver(state), {
    allowOpReturn: true,
  });

  if (!result.success) {
    throw new Error(
      `${label ? `${label}: ` : ""}${JSON.stringify(result.errors)}`,
    );
  }
  expect(result.inputs.every((input) => input.success)).toBe(true);
  return result;
};

const txOutputs = (txHex: string) => {
  const tx = TransactionReader.readHex(txHex);
  return tx.Outputs.map((output, index) => ({
    tx,
    index,
    output,
    locking: decomposeDstasLockingScript(output.LockingScript),
  }));
};

const findFeeOutPoint = (
  txHex: string,
  owner: Wallet,
): OutPoint => {
  const tx = TransactionReader.readHex(txHex);
  const feeIndex = tx.Outputs.findIndex(
    (output) =>
      output.ScriptType === ScriptType.p2pkh &&
      output.Address?.Hash160 &&
      toHex(output.Address.Hash160) === toHex(owner.Address.Hash160),
  );

  if (feeIndex < 0) {
    throw new Error(`Missing fee output for ${tx.Id}`);
  }

  return OutPoint.fromTransaction(tx, feeIndex);
};

const findDstasOutputs = (txHex: string) =>
  txOutputs(txHex).filter(({ locking }) => locking.baseMatched);

describe("dstas swap remainder chain", () => {
  test("spends the same swap-marked remainder through three sequential partial swaps", () => {
    const seller = Wallet.fromMnemonic(
      "group spy extend supreme monkey judge avocado cancel exit educate modify bubble",
    ).deriveWallet("m/44'/236'/0'/0/0");
    const buyer = Wallet.fromMnemonic(
      "group spy extend supreme monkey judge avocado cancel exit educate modify bubble",
    ).deriveWallet("m/44'/236'/0'/0/1");
    const negativeBuyer = Wallet.fromMnemonic(
      "group spy extend supreme monkey judge avocado cancel exit educate modify bubble",
    ).deriveWallet("m/44'/236'/0'/0/2");
    const feeWallet = Wallet.fromMnemonic(
      "group spy extend supreme monkey judge avocado cancel exit educate modify bubble",
    ).deriveWallet("m/44'/236'/0'/0/3");

    const sellerScheme = createDefaultDstasScheme(seller, seller);
    const buyerScheme = createDefaultDstasScheme(buyer, buyer);
    const negativeScheme = createDefaultDstasScheme(negativeBuyer, negativeBuyer);

    const state: TResolverState = {
      txMap: new Map(),
      syntheticPrevouts: new Map(),
    };

    const sellerFunding = makeSyntheticFundingOutPoint(seller, "11");
    const buyerFunding = makeSyntheticFundingOutPoint(buyer, "22");
    const negativeFunding = makeSyntheticFundingOutPoint(negativeBuyer, "33");
    const feeFunding = makeSyntheticFundingOutPoint(
      feeWallet,
      "44",
      1_000_000,
    );

    state.syntheticPrevouts.set(resolverKey(sellerFunding.TxId, sellerFunding.Vout), {
      lockingScript: sellerFunding.LockingScript,
      satoshis: sellerFunding.Satoshis,
    });
    state.syntheticPrevouts.set(resolverKey(buyerFunding.TxId, buyerFunding.Vout), {
      lockingScript: buyerFunding.LockingScript,
      satoshis: buyerFunding.Satoshis,
    });
    state.syntheticPrevouts.set(
      resolverKey(negativeFunding.TxId, negativeFunding.Vout),
      {
        lockingScript: negativeFunding.LockingScript,
        satoshis: negativeFunding.Satoshis,
      },
    );
    state.syntheticPrevouts.set(resolverKey(feeFunding.TxId, feeFunding.Vout), {
      lockingScript: feeFunding.LockingScript,
      satoshis: feeFunding.Satoshis,
    });

    const issueBuyer = BuildDstasIssueTxs({
      fundingPayment: {
        OutPoint: buyerFunding,
        Owner: buyer,
      },
      scheme: buyerScheme,
      destinations: [
        {
          Satoshis: 60,
          To: buyer.Address,
          ActionData: null,
        },
        {
          Satoshis: 60,
          To: buyer.Address,
          ActionData: null,
        },
        {
          Satoshis: 60,
          To: buyer.Address,
          ActionData: null,
        },
      ],
      feeRate: FeeRate,
    });

    assertTxValid(state, issueBuyer.contractTxHex);
    storeTx(state, issueBuyer.contractTxHex);
    assertTxValid(state, issueBuyer.issueTxHex);
    const buyerIssueTx = storeTx(state, issueBuyer.issueTxHex);

    const buyerLockingScript = buyerIssueTx.Outputs.find(
      (output) => output.ScriptType === ScriptType.dstas,
    )?.LockingScript;
    expect(buyerLockingScript).toBeDefined();

    const sellerActionData = buildSwapActionData({
      requestedScriptHash: computeDstasRequestedScriptHash(
        buyerLockingScript!,
      ),
      requestedPkh: seller.Address.Hash160,
      rateNumerator: 1,
      rateDenominator: 1,
    });
    const sellerActionDataHex = toHex(sellerActionData);

    const issueSeller = BuildDstasIssueTxs({
      fundingPayment: {
        OutPoint: sellerFunding,
        Owner: seller,
      },
      scheme: sellerScheme,
      destinations: [
        {
          Satoshis: 300,
          To: seller.Address,
          ActionData: sellerActionData,
        },
      ],
      feeRate: FeeRate,
    });

    assertTxValid(state, issueSeller.contractTxHex);
    storeTx(state, issueSeller.contractTxHex);
    assertTxValid(state, issueSeller.issueTxHex);
    const sellerIssueTx = storeTx(state, issueSeller.issueTxHex);

    const issueNegative = BuildDstasIssueTxs({
      fundingPayment: {
        OutPoint: negativeFunding,
        Owner: negativeBuyer,
      },
      scheme: negativeScheme,
      destinations: [
        {
          Satoshis: 60,
          To: negativeBuyer.Address,
          ActionData: null,
        },
      ],
      feeRate: FeeRate,
    });

    assertTxValid(state, issueNegative.contractTxHex);
    storeTx(state, issueNegative.contractTxHex);
    assertTxValid(state, issueNegative.issueTxHex);
    const negativeIssueTx = storeTx(state, issueNegative.issueTxHex);

    const sellerIssueOutputs = findDstasOutputs(issueSeller.issueTxHex);
    expect(sellerIssueOutputs).toHaveLength(1);
    expect(sellerIssueOutputs[0].locking.actionData?.kind).toBe("data");
    if (sellerIssueOutputs[0].locking.actionData?.kind === "data") {
      expect(sellerIssueOutputs[0].locking.actionData.hex).toBe(
        sellerActionDataHex,
      );
    }

    const buyerSpendableOutPoints = buyerIssueTx.Outputs
      .map((output, index) => ({ output, index }))
      .filter(({ output }) => output.ScriptType === ScriptType.dstas)
      .map(({ index }) => OutPoint.fromTransaction(buyerIssueTx, index));

    expect(buyerSpendableOutPoints).toHaveLength(3);

    const runPartialSwap = ({
      step,
      sellerInput,
      buyerInput,
      feeInput,
      sellerRemainingSatoshis,
    }: {
      step: string;
      sellerInput: OutPoint;
      buyerInput: OutPoint;
      feeInput: OutPoint;
      sellerRemainingSatoshis: number;
    }) => {
      const swapTxHex = BuildDstasTransferSwapTx({
        stasPayments: [
          { OutPoint: sellerInput, Owner: seller },
          { OutPoint: buyerInput, Owner: buyer },
        ],
        feePayment: { OutPoint: feeInput, Owner: feeWallet },
        destinations: [
          swapDestinationForFlow({
            satoshis: 60,
            owner: seller.Address.Hash160,
            tokenIdHex: buyerScheme.TokenId,
            freezable: buyerScheme.Freeze,
            confiscatable: buyerScheme.Confiscation,
            authorityServiceField: hash160(buyer.PublicKey),
            confiscationAuthorityServiceField: hash160(buyer.PublicKey),
            actionData: null,
          }),
          swapDestinationForFlow({
            satoshis: 60,
            owner: buyer.Address.Hash160,
            tokenIdHex: sellerScheme.TokenId,
            freezable: sellerScheme.Freeze,
            confiscatable: sellerScheme.Confiscation,
            authorityServiceField: hash160(seller.PublicKey),
            confiscationAuthorityServiceField: hash160(seller.PublicKey),
            actionData: null,
          }),
          swapDestinationForFlow({
            satoshis: sellerRemainingSatoshis,
            owner: seller.Address.Hash160,
            tokenIdHex: sellerScheme.TokenId,
            freezable: sellerScheme.Freeze,
            confiscatable: sellerScheme.Confiscation,
            authorityServiceField: hash160(seller.PublicKey),
            confiscationAuthorityServiceField: hash160(seller.PublicKey),
            actionData: sellerActionData,
          }),
        ],
        feeRate: FeeRate,
      });

      const swapTx = TransactionReader.readHex(swapTxHex);
      expect(
        swapTx.Inputs.some(
          (input) =>
            input.TxId === sellerInput.TxId && input.Vout === sellerInput.Vout,
        ),
      ).toBe(true);

      assertTxValid(state, swapTxHex, step);
      storeTx(state, swapTxHex);

      const decodedOutputs = txOutputs(swapTxHex).filter(
        ({ locking }) => locking.baseMatched,
      );
      const sellerRemainder = decodedOutputs.find(
        ({ locking }) =>
          locking.ownerHex === toHex(seller.Address.Hash160) &&
          locking.actionData?.kind === "data" &&
          locking.actionData.hex === sellerActionDataHex,
      );
      expect(sellerRemainder).toBeDefined();
      expect(sellerRemainder?.locking.actionData?.kind).toBe("data");
      if (sellerRemainder?.locking.actionData?.kind === "data") {
        expect(sellerRemainder.locking.actionData.hex).toBe(
          sellerActionDataHex,
        );
      }

      const buyerPrincipal = decodedOutputs.find(
        ({ locking }) =>
          locking.ownerHex === toHex(buyer.Address.Hash160) &&
          locking.actionData?.kind === "opcode" &&
          locking.actionData.opcode === 0,
      );
      expect(buyerPrincipal).toBeDefined();

      const sellerReward = decodedOutputs.find(
        ({ locking }) =>
          locking.ownerHex === toHex(seller.Address.Hash160) &&
          locking.actionData?.kind === "opcode" &&
          locking.actionData.opcode === 0,
      );
      expect(sellerReward).toBeDefined();

      const feeOutput = findFeeOutPoint(swapTxHex, feeWallet);

      return {
        swapTxHex,
        swapTx,
        sellerRemainderOutPoint: OutPoint.fromTransaction(
          sellerRemainder!.tx,
          sellerRemainder!.index,
        ),
        feeOutPoint: feeOutput,
      };
    };

    const first = runPartialSwap({
      step: "swap-1",
      sellerInput: OutPoint.fromTransaction(sellerIssueTx, 0),
      buyerInput: buyerSpendableOutPoints[0],
      feeInput: feeFunding,
      sellerRemainingSatoshis: 240,
    });

    const second = runPartialSwap({
      step: "swap-2",
      sellerInput: first.sellerRemainderOutPoint,
      buyerInput: buyerSpendableOutPoints[1],
      feeInput: first.feeOutPoint,
      sellerRemainingSatoshis: 180,
    });

    const third = runPartialSwap({
      step: "swap-3",
      sellerInput: second.sellerRemainderOutPoint,
      buyerInput: buyerSpendableOutPoints[2],
      feeInput: second.feeOutPoint,
      sellerRemainingSatoshis: 120,
    });

    expect(
      txOutputs(first.swapTxHex).find(
        ({ locking }) =>
          locking.ownerHex === toHex(seller.Address.Hash160) &&
          locking.actionData?.kind === "data" &&
          locking.actionData.hex === sellerActionDataHex,
      ),
    ).toBeDefined();
    expect(
      txOutputs(second.swapTxHex).find(
        ({ locking }) =>
          locking.ownerHex === toHex(seller.Address.Hash160) &&
          locking.actionData?.kind === "data" &&
          locking.actionData.hex === sellerActionDataHex,
      ),
    ).toBeDefined();
    expect(
      txOutputs(third.swapTxHex).find(
        ({ locking }) =>
          locking.ownerHex === toHex(seller.Address.Hash160) &&
          locking.actionData?.kind === "data" &&
          locking.actionData.hex === sellerActionDataHex,
      ),
    ).toBeDefined();

    const negativeTxHex = BuildDstasTransferSwapTx({
      stasPayments: [
        { OutPoint: third.sellerRemainderOutPoint, Owner: seller },
        {
          OutPoint: OutPoint.fromTransaction(negativeIssueTx, 0),
          Owner: negativeBuyer,
        },
      ],
      feePayment: { OutPoint: third.feeOutPoint, Owner: feeWallet },
      destinations: [
        swapDestinationForFlow({
          satoshis: 60,
          owner: seller.Address.Hash160,
          tokenIdHex: negativeScheme.TokenId,
          freezable: negativeScheme.Freeze,
          confiscatable: negativeScheme.Confiscation,
          authorityServiceField: hash160(negativeBuyer.PublicKey),
          confiscationAuthorityServiceField: hash160(negativeBuyer.PublicKey),
          actionData: null,
        }),
        swapDestinationForFlow({
          satoshis: 60,
          owner: negativeBuyer.Address.Hash160,
          tokenIdHex: sellerScheme.TokenId,
          freezable: sellerScheme.Freeze,
          confiscatable: sellerScheme.Confiscation,
          authorityServiceField: hash160(seller.PublicKey),
          confiscationAuthorityServiceField: hash160(seller.PublicKey),
          actionData: null,
        }),
        swapDestinationForFlow({
          satoshis: 60,
          owner: seller.Address.Hash160,
          tokenIdHex: sellerScheme.TokenId,
          freezable: sellerScheme.Freeze,
          confiscatable: sellerScheme.Confiscation,
          authorityServiceField: hash160(seller.PublicKey),
          confiscationAuthorityServiceField: hash160(seller.PublicKey),
          actionData: sellerActionData,
        }),
      ],
      feeRate: FeeRate,
    });

    const negativeEval = evaluateTransactionHex(
      negativeTxHex,
      createResolver(state),
      { allowOpReturn: true },
    );

    expect(negativeEval.success).toBe(false);
    expect(negativeEval.inputs.some((input) => !input.success)).toBe(true);
  });
});
