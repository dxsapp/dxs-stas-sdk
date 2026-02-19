import {
  Address,
  OutPoint,
  ScriptType,
  TPayment,
  Transaction,
  Wallet,
} from "./bitcoin";
import { Bytes } from "./bytes";
import { TransactionBuilder, TransactionReader } from "./transaction";
import { OutputBuilder } from "./transaction/build/output-builder";
import { FeeRate } from "./transaction-factory";
import {
  Stas3FreezeMultisigParams,
  buildStas3FreezeMultisigScript,
} from "./script/build/stas3-freeze-multisig-builder";
import { ScriptBuilder } from "./script/build/script-builder";
import { ScriptReader } from "./script/read/script-reader";

export const AvgFeeForStas30Merge = 500;

export type TDstasFundingUtxoRequest = {
  utxoIdsToSpend: string[];
  estimatedFeeSatoshis: number;
  transactionsCount: number;
};

export type TDstasGetUtxoFunction = (satoshis?: number) => Promise<OutPoint[]>;
export type TDstasGetFundingUtxoFunction = (
  request: TDstasFundingUtxoRequest,
) => Promise<OutPoint>;
export type TDstasGetTransactionsFunction = (
  ids: string[],
) => Promise<Record<string, Transaction>>;

export type TDstasPayoutBundle = {
  transactions?: string[];
  feeSatoshis: number;
  message?: string;
  devMessage?: string;
};

export type DstasSpendType =
  | "transfer"
  | "split"
  | "merge"
  | "freeze"
  | "unfreeze"
  | "confiscation"
  | "swap";

export type TDstasRecipient = {
  m: number;
  addresses: Address[];
};

export type TDstasTransferOutput = {
  recipient: TDstasRecipient;
  satoshis: number;
};

export type TDstasTransferRequest = {
  outputs: TDstasTransferOutput[];
  spendType?: "transfer" | "freeze" | "unfreeze";
  note?: Bytes[];
};

export type TDstasLockingParamsBuilder = (args: {
  fromOutPoint: OutPoint;
  recipient: TDstasRecipient;
  spendType: DstasSpendType;
  isFreezeLike: boolean;
  outputIndex: number;
  outputCount: number;
  isChange: boolean;
}) => Stas3FreezeMultisigParams;

export type TDstasUnlockingScriptBuilder = (args: {
  txBuilder: TransactionBuilder;
  inputIndex: number;
  outPoint: OutPoint;
  spendType: DstasSpendType;
  isFreezeLike: boolean;
  isMerge: boolean;
}) => Bytes;

export type TDstasPayment = TPayment & {
  UnlockingScript?: Bytes;
};

export type TDstasDestination = {
  Satoshis: number;
  LockingParams: Stas3FreezeMultisigParams;
};

export class DstasBundleFactory {
  constructor(
    private readonly stasWallet: Wallet,
    private readonly feeWallet: Wallet,
    private readonly getFundingUtxo: TDstasGetFundingUtxoFunction,
    private readonly getStasUtxoSet: TDstasGetUtxoFunction,
    private readonly getTransactions: TDstasGetTransactionsFunction,
    private readonly buildLockingParams: TDstasLockingParamsBuilder,
    private readonly buildUnlockingScript: TDstasUnlockingScriptBuilder,
  ) {}

  public transfer = async ({
    outputs,
    spendType = "transfer",
    note,
  }: TDstasTransferRequest): Promise<TDstasPayoutBundle> => {
    if (outputs.length === 0) {
      throw new Error("At least one transfer output is required");
    }

    for (const output of outputs) {
      if (!Number.isInteger(output.satoshis) || output.satoshis <= 0) {
        throw new Error(
          `Transfer output satoshis must be a positive integer, got ${output.satoshis}`,
        );
      }
    }

    const amountSatoshis = outputs.reduce((sum, x) => sum + x.satoshis, 0);
    const stasUtxoSet = (await this.getStasUtxoSet(amountSatoshis)).sort(
      (a, b) => a.Satoshis - b.Satoshis,
    );
    const availableSatoshis = stasUtxoSet.reduce((a, x) => a + x.Satoshis, 0);

    if (availableSatoshis < amountSatoshis) {
      return {
        message: "Insufficient STAS tokens balance",
        feeSatoshis: 0,
      };
    }

    const stasUtxos = this.getStasUtxo(stasUtxoSet, amountSatoshis);
    return this.buildBundleWithResolvedFunding(
      stasUtxos,
      amountSatoshis,
      outputs,
      spendType,
      note,
    );
  };

  public createTransferBundle = async (
    amountSatoshis: number,
    recipient: TDstasRecipient,
    note?: Bytes[],
  ) =>
    this.transfer({
      outputs: [{ recipient, satoshis: amountSatoshis }],
      spendType: "transfer",
      note,
    });

  public createFreezeBundle = async (
    amountSatoshis: number,
    recipient: TDstasRecipient,
    note?: Bytes[],
  ) =>
    this.transfer({
      outputs: [{ recipient, satoshis: amountSatoshis }],
      spendType: "freeze",
      note,
    });

  public createUnfreezeBundle = async (
    amountSatoshis: number,
    recipient: TDstasRecipient,
    note?: Bytes[],
  ) =>
    this.transfer({
      outputs: [{ recipient, satoshis: amountSatoshis }],
      spendType: "unfreeze",
      note,
    });

  public createSwapBundle = async (
    amountSatoshis: number,
    recipient: TDstasRecipient,
    note?: Bytes[],
  ) => this.createBundle(amountSatoshis, recipient, "swap", note);

  public createConfiscationBundle = async (
    amountSatoshis: number,
    recipient: TDstasRecipient,
    note?: Bytes[],
  ) => this.createBundle(amountSatoshis, recipient, "confiscation", note);

  public createBundle = async (
    amountSatoshis: number,
    recipient: TDstasRecipient,
    spendType: DstasSpendType,
    note?: Bytes[],
  ): Promise<TDstasPayoutBundle> => {
    const stasUtxoSet = (await this.getStasUtxoSet(amountSatoshis)).sort(
      (a, b) => a.Satoshis - b.Satoshis,
    );
    const availableSatoshis = stasUtxoSet.reduce((a, x) => a + x.Satoshis, 0);

    if (availableSatoshis < amountSatoshis)
      return {
        message: "Insufficient STAS tokens balance",
        feeSatoshis: 0,
      };

    const stasUtxos = this.getStasUtxo(stasUtxoSet, amountSatoshis);
    return this.buildBundleWithResolvedFunding(
      stasUtxos,
      amountSatoshis,
      [{ recipient, satoshis: amountSatoshis }],
      spendType,
      note,
    );
  };

  private buildBundleWithResolvedFunding = async (
    stasUtxos: OutPoint[],
    amountSatoshis: number,
    outputs: TDstasTransferOutput[],
    spendType: DstasSpendType,
    note?: Bytes[],
  ): Promise<TDstasPayoutBundle> => {
    const utxoIdsToSpend = stasUtxos.map((x) => `${x.TxId}:${x.Vout}`);
    const transactionsCount = this.estimateTransactionsCount(
      stasUtxos.length,
      outputs.length,
    );
    const initialEstimatedFeeSatoshis = this.estimateBundleFeeUpperBound(
      transactionsCount,
      stasUtxos.length,
    );
    const firstFundingUtxo = await this.getFundingUtxo({
      utxoIdsToSpend,
      estimatedFeeSatoshis: initialEstimatedFeeSatoshis,
      transactionsCount,
    });

    try {
      return this._createTransferBundle(
        [],
        stasUtxos,
        amountSatoshis,
        firstFundingUtxo,
        outputs,
        spendType,
        note,
      );
    } catch (error) {
      if (!this.isInsufficientFeeError(error)) throw error;

      // Rare fallback: request more funding once; avoids N retries + full rebuild loops.
      const fallbackEstimatedFeeSatoshis =
        Math.ceil(initialEstimatedFeeSatoshis * 1.5) + 200;
      const secondFundingUtxo = await this.getFundingUtxo({
        utxoIdsToSpend,
        estimatedFeeSatoshis: fallbackEstimatedFeeSatoshis,
        transactionsCount,
      });

      return this._createTransferBundle(
        [],
        stasUtxos,
        amountSatoshis,
        secondFundingUtxo,
        outputs,
        spendType,
        note,
      );
    }
  };

  private estimateTransactionsCount = (
    stasInputCount: number,
    outputsCount: number,
  ): number =>
    this.estimateMergeTransactionsCount(stasInputCount) +
    this.estimateFinalTransferTransactionsCount(outputsCount);

  private estimateMergeTransactionsCount = (stasInputCount: number): number => {
    if (stasInputCount <= 1) return 0;

    let currentLevelCount = stasInputCount;
    let levelsBeforeTransfer = 0;
    let transactionCount = 0;

    while (currentLevelCount !== 1) {
      if (levelsBeforeTransfer === 3) {
        levelsBeforeTransfer = 0;
        transactionCount += currentLevelCount;
      } else {
        levelsBeforeTransfer++;
        const merges = Math.floor(currentLevelCount / 2);
        const remainder = currentLevelCount % 2;
        transactionCount += merges;
        currentLevelCount = merges + remainder;
      }
    }

    return transactionCount;
  };

  private estimateFinalTransferTransactionsCount = (
    outputsCount: number,
  ): number => Math.max(1, Math.ceil((outputsCount - 1) / 3));

  private estimateBundleFeeUpperBound = (
    transactionsCount: number,
    stasInputCount: number,
  ): number =>
    Math.max(1200, transactionsCount * 3000 + stasInputCount * 500 + 300);

  private isInsufficientFeeError = (error: unknown): boolean => {
    if (!(error instanceof Error)) return false;
    const message = `${error.message}${error.stack ?? ""}`;
    return message.includes("Insufficient satoshis to pay fee");
  };

  private _createTransferBundle = async (
    transactions: string[],
    stasUtxos: OutPoint[],
    satoshisToSend: number,
    feeUtxo: OutPoint,
    outputs: TDstasTransferOutput[],
    spendType: DstasSpendType,
    note?: Bytes[],
  ) => {
    const { mergeTransactions, mergeFeeUtxo, stasUtxo } =
      await this.mergeStasTransactions(stasUtxos, satoshisToSend, feeUtxo);

    if (mergeTransactions) {
      for (const mergeTx of mergeTransactions) {
        transactions.push(mergeTx);
      }
    }

    const { transactions: transferTransactions, feeOutPoint: feeUtxoOutPoint } =
      this.buildTransferPlanTransactions(
        stasUtxo,
        mergeFeeUtxo,
        outputs,
        spendType,
        note,
      );

    for (const tx of transferTransactions) {
      transactions.push(tx);
    }

    const paidFee = feeUtxo.Satoshis - feeUtxoOutPoint.Satoshis;

    return { transactions, feeSatoshis: paidFee };
  };

  private buildTransferPlanTransactions = (
    stasUtxo: OutPoint,
    feeUtxo: OutPoint,
    outputs: TDstasTransferOutput[],
    spendType: DstasSpendType,
    note?: Bytes[],
  ): {
    transactions: string[];
    feeOutPoint: OutPoint;
  } => {
    const queue = outputs.slice();
    const transactions: string[] = [];
    const selfRecipient: TDstasRecipient = {
      m: 1,
      addresses: [this.stasWallet.Address],
    };

    let currentStas = stasUtxo;
    let currentFee = feeUtxo;

    while (queue.length > 0) {
      const remainingTotal = queue.reduce((sum, x) => sum + x.satoshis, 0);
      if (remainingTotal !== currentStas.Satoshis) {
        throw new Error(
          "Transfer planner invariant failed: remaining outputs must match current STAS input",
        );
      }

      const isFinal = queue.length <= 4;
      const transferOutputs = isFinal ? queue : queue.slice(0, 3);
      const sentSatoshis = transferOutputs.reduce(
        (sum, x) => sum + x.satoshis,
        0,
      );

      const txOutputs: {
        recipient: TDstasRecipient;
        satoshis: number;
        isChange: boolean;
      }[] = transferOutputs.map((x) => ({
        recipient: x.recipient,
        satoshis: x.satoshis,
        isChange: false,
      }));

      if (!isFinal) {
        txOutputs.push({
          recipient: selfRecipient,
          satoshis: currentStas.Satoshis - sentSatoshis,
          isChange: true,
        });
      }

      const destinations = this.buildDestinations(
        currentStas,
        txOutputs,
        spendType,
      );
      const txRaw = this.buildStas30Tx({
        stasPayments: [{ OutPoint: currentStas, Owner: this.stasWallet }],
        feePayment: { OutPoint: currentFee, Owner: this.feeWallet },
        destinations,
        note: isFinal ? note : undefined,
        spendType,
        isMerge: false,
      });

      const tx = TransactionReader.readHex(txRaw);
      transactions.push(txRaw);
      currentFee = this.getFeeOutPoint(tx);

      if (isFinal) break;

      const changeOutputIndex = txOutputs.length - 1;
      const changeOutput = tx.Outputs[changeOutputIndex];
      if (!changeOutput) {
        throw new Error("Transfer planner failed to locate STAS change output");
      }

      currentStas = new OutPoint(
        tx.Id,
        changeOutputIndex,
        changeOutput.LockingScript,
        changeOutput.Satoshis,
        this.stasWallet.Address,
        changeOutput.ScriptType,
      );

      queue.splice(0, transferOutputs.length);
    }

    return {
      transactions,
      feeOutPoint: currentFee,
    };
  };

  private getStasUtxo = (utxos: OutPoint[], satoshis: number): OutPoint[] => {
    const exactOrGreater = utxos.find((x) => x.Satoshis >= satoshis);

    if (exactOrGreater && exactOrGreater.Satoshis === satoshis) {
      return [exactOrGreater];
    }

    const result: OutPoint[] = [];
    let accumulated = 0;
    for (const utxo of utxos) {
      result.push(utxo);
      accumulated += utxo.Satoshis;

      if (accumulated >= satoshis) return result;
    }

    return [exactOrGreater!];
  };

  private mergeStasTransactions = async (
    stasUtxos: OutPoint[],
    satoshis: number,
    mergeFeeUtxo: OutPoint,
  ): Promise<{
    mergeTransactions?: string[];
    stasUtxo: OutPoint;
    mergeFeeUtxo: OutPoint;
  }> => {
    if (stasUtxos.length === 1) return { mergeFeeUtxo, stasUtxo: stasUtxos[0] };

    const mergeTransactions: string[] = [];
    const utxos = stasUtxos.map(({ TxId, Vout, Address: outPointAddress }) => ({
      TxId,
      Vout,
      outPointAddress,
    }));
    const txIds = Array.from(new Set(stasUtxos.map(({ TxId }) => TxId)));
    const sourceTransactions = await this.getTransactions(txIds);
    const mergeLevels: OutPoint[][] = [[]];

    for (const { TxId, Vout, outPointAddress } of utxos) {
      const tx = sourceTransactions[TxId];

      if (!tx) throw new Error(`Transaction ${TxId} not found`);

      mergeLevels[0].push(
        this.outPointFromTransaction(tx, Vout, outPointAddress),
      );
    }

    const feePayment: TPayment = {
      OutPoint: mergeFeeUtxo,
      Owner: this.feeWallet,
    };
    let currentLevel = mergeLevels[0];
    let levelsBeforeTransfer = 0;
    let stasUtxo = stasUtxos[0];

    while (currentLevel.length !== 1) {
      const newLevel: OutPoint[] = [];
      mergeLevels.push(newLevel);

      if (levelsBeforeTransfer === 3) {
        levelsBeforeTransfer = 0;

        for (const outPoint of currentLevel) {
          const stasPayment: TDstasPayment = {
            OutPoint: outPoint,
            Owner: this.stasWallet,
          };

          const destinations = this.buildDestinations(
            outPoint,
            [
              {
                recipient: {
                  m: 1,
                  addresses: [this.stasWallet.Address],
                },
                satoshis: outPoint.Satoshis,
                isChange: false,
              },
            ],
            "transfer",
          );

          const txRaw = this.buildStas30Tx({
            stasPayments: [stasPayment],
            feePayment,
            destinations,
            spendType: "transfer",
            isMerge: false,
          });
          const tx = TransactionReader.readHex(txRaw);

          newLevel.push(this.getStasOutPoint(tx, outPoint.Address));
          mergeTransactions.push(txRaw);

          stasUtxo = this.getStasOutPoint(tx, outPoint.Address);
          feePayment.OutPoint = this.getFeeOutPoint(tx);
        }
      } else {
        levelsBeforeTransfer++;

        const mergeCounts = Math.floor(currentLevel.length / 2);
        const remainder = currentLevel.length % 2;

        if (remainder !== 0)
          newLevel.push(currentLevel[currentLevel.length - 1]);

        let currentIdx = 0;

        for (let i = 0; i < mergeCounts; i++) {
          const outPoint1 = currentLevel[currentIdx++];
          const outPoint2 = currentLevel[currentIdx++];
          const lastMerge = mergeCounts === 1 && remainder === 0;
          const inputSatoshis = outPoint1.Satoshis + outPoint2.Satoshis;

          let outputs = [
            {
              recipient: {
                m: 1,
                addresses: [this.stasWallet.Address],
              },
              satoshis: inputSatoshis,
              isChange: false,
            },
          ];

          if (lastMerge && inputSatoshis !== satoshis) {
            outputs = [
              {
                recipient: {
                  m: 1,
                  addresses: [this.stasWallet.Address],
                },
                satoshis,
                isChange: false,
              },
              {
                recipient: {
                  m: 1,
                  addresses: [this.stasWallet.Address],
                },
                satoshis: inputSatoshis - satoshis,
                isChange: true,
              },
            ];
          }

          const destinations = this.buildDestinations(
            outPoint1,
            outputs,
            "merge",
          );

          const txRaw = this.buildStas30Tx({
            stasPayments: [
              { OutPoint: outPoint1, Owner: this.stasWallet },
              { OutPoint: outPoint2, Owner: this.stasWallet },
            ],
            feePayment,
            destinations,
            spendType: "merge",
            isMerge: true,
          });
          const tx = TransactionReader.readHex(txRaw);

          newLevel.push(this.getStasOutPoint(tx, outPoint1.Address));
          mergeTransactions.push(txRaw);

          stasUtxo = this.getStasOutPoint(tx, outPoint1.Address);
          feePayment.OutPoint = this.getFeeOutPoint(tx);
        }
      }

      currentLevel = newLevel;
    }

    return { mergeTransactions, mergeFeeUtxo: feePayment.OutPoint, stasUtxo };
  };

  private buildStas30Tx = (params: {
    stasPayments: TDstasPayment[];
    feePayment: TPayment;
    destinations: TDstasDestination[];
    note?: Bytes[];
    feeRate?: number;
    spendType: DstasSpendType;
    isMerge: boolean;
  }) => {
    const {
      stasPayments,
      feePayment,
      destinations,
      note,
      feeRate,
      spendType,
      isMerge,
    } = params;

    if (stasPayments.length === 0)
      throw new Error("At least one STAS input is required");
    if (destinations.length === 0)
      throw new Error("At least one destination is required");

    this.validateStasAmounts(stasPayments, destinations);

    const txBuilder = TransactionBuilder.init();
    const stasInputIdxs: number[] = [];

    for (const payment of stasPayments) {
      txBuilder.addInput(payment.OutPoint, payment.Owner);
      stasInputIdxs.push(txBuilder.Inputs.length - 1);
    }

    txBuilder.addInput(feePayment.OutPoint, feePayment.Owner);

    for (const dest of destinations) {
      const lockingScript = this.buildDstasLockingScriptBuilder(
        dest.LockingParams,
      );
      txBuilder.Outputs.push(new OutputBuilder(lockingScript, dest.Satoshis));
    }

    const feeOutputIdx = txBuilder.Outputs.length;

    if (note) txBuilder.addNullDataOutput(note);

    txBuilder.addChangeOutputWithFee(
      feePayment.OutPoint.Address,
      feePayment.OutPoint.Satoshis,
      feeRate ?? FeeRate,
      feeOutputIdx,
    );

    for (const idx of stasInputIdxs) {
      const input = txBuilder.Inputs[idx];
      input.AllowPresetUnlockingScript = true;
      input.UnlockingScript = this.buildUnlockingScript({
        txBuilder,
        inputIndex: idx,
        outPoint: input.OutPoint,
        spendType,
        isFreezeLike: spendType === "freeze" || spendType === "unfreeze",
        isMerge,
      });
    }

    return txBuilder.sign().toHex();
  };

  private buildDestinations = (
    sourceOutPoint: OutPoint,
    outputs: {
      recipient: TDstasRecipient;
      satoshis: number;
      isChange: boolean;
    }[],
    spendType: DstasSpendType,
  ): TDstasDestination[] => {
    const outputCount = outputs.length;

    return outputs.map((output, index) => ({
      Satoshis: output.satoshis,
      LockingParams: this.buildLockingParams({
        fromOutPoint: sourceOutPoint,
        recipient: output.recipient,
        spendType,
        isFreezeLike: spendType === "freeze" || spendType === "unfreeze",
        outputIndex: index,
        outputCount,
        isChange: output.isChange,
      }),
    }));
  };

  private validateStasAmounts = (
    stasPayments: TDstasPayment[],
    destinations: TDstasDestination[],
  ) => {
    const inputTotal = stasPayments.reduce(
      (sum, p) => sum + p.OutPoint.Satoshis,
      0,
    );
    const outputTotal = destinations.reduce((sum, d) => sum + d.Satoshis, 0);

    if (inputTotal !== outputTotal)
      throw new Error("Input satoshis must be equal output satoshis");
  };

  private buildDstasLockingScriptBuilder = (
    params: Stas3FreezeMultisigParams,
  ) => {
    const scriptBytes = buildStas3FreezeMultisigScript(params);
    const tokens = ScriptReader.read(scriptBytes);
    return ScriptBuilder.fromTokens(tokens, ScriptType.dstas);
  };

  private outPointFromTransaction = (
    tx: Transaction,
    vout: number,
    fallbackAddress: Address,
  ): OutPoint => {
    const output = tx.Outputs[vout];
    const owner = output.Address ?? fallbackAddress;

    return new OutPoint(
      tx.Id,
      vout,
      output.LockingScript,
      output.Satoshis,
      owner,
      output.ScriptType,
    );
  };

  private getStasOutPoint = (
    tx: Transaction,
    fallbackAddress: Address,
  ): OutPoint => {
    const index = tx.Outputs.findIndex(
      (output) =>
        output.ScriptType !== ScriptType.p2pkh &&
        output.ScriptType !== ScriptType.p2mpkh &&
        output.ScriptType !== ScriptType.nullData,
    );

    if (index === -1) throw new Error("STAS output not found");

    return this.outPointFromTransaction(tx, index, fallbackAddress);
  };

  private getFeeOutPoint = (tx: Transaction): OutPoint => {
    for (let i = tx.Outputs.length - 1; i >= 0; i--) {
      const output = tx.Outputs[i];
      if (
        output.ScriptType === ScriptType.p2pkh ||
        output.ScriptType === ScriptType.p2mpkh
      ) {
        return new OutPoint(
          tx.Id,
          i,
          output.LockingScript,
          output.Satoshis,
          output.Address!,
          output.ScriptType,
        );
      }
    }

    throw new Error("Fee output not found");
  };
}
