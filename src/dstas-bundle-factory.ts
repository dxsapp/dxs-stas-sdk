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
import { P2pkhBuilder } from "./script/build/p2pkh-builder";
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
  | "swap";

export type TDstasRecipient = {
  m: number;
  addresses: Address[];
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

const DummyTxId =
  "0000000000000000000000000000000000000000000000000000000000000000";

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

  public createTransferBundle = async (
    amountSatoshis: number,
    recipient: TDstasRecipient,
    note?: Bytes[],
  ) => this.createBundle(amountSatoshis, recipient, "transfer", note);

  public createFreezeBundle = async (
    amountSatoshis: number,
    recipient: TDstasRecipient,
    note?: Bytes[],
  ) => this.createBundle(amountSatoshis, recipient, "freeze", note);

  public createUnfreezeBundle = async (
    amountSatoshis: number,
    recipient: TDstasRecipient,
    note?: Bytes[],
  ) => this.createBundle(amountSatoshis, recipient, "unfreeze", note);

  public createSwapBundle = async (
    amountSatoshis: number,
    recipient: TDstasRecipient,
    note?: Bytes[],
  ) => this.createBundle(amountSatoshis, recipient, "swap", note);

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
    const {
      feeSatoshis: estimatedFee,
      transactions: { length: transactionsCount },
    } = await this._createBundle(
      [],
      stasUtxos,
      amountSatoshis,
      this.getDummyFeeUtxo(),
      recipient,
      spendType,
      note,
    );

    const adjustedEstimatedFee =
      estimatedFee + stasUtxos.length * 9 + 1; /* Fee for fee transaction */
    const fundingUtxo = await this.getFundingUtxo({
      utxoIdsToSpend: stasUtxos.map((x) => `${x.TxId}:${x.Vout}`),
      estimatedFeeSatoshis: adjustedEstimatedFee + 1,
      transactionsCount,
    });

    const transactions: string[] = [];

    return this._createBundle(
      transactions,
      stasUtxos,
      amountSatoshis,
      fundingUtxo,
      recipient,
      spendType,
      note,
    );
  };

  private _createBundle = async (
    transactions: string[],
    stasUtxos: OutPoint[],
    satoshisToSend: number,
    feeUtxo: OutPoint,
    recipient: TDstasRecipient,
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

    if (stasUtxo.Satoshis === satoshisToSend) {
      transactions.push(
        this.buildTransferTransaction(
          stasUtxo,
          mergeFeeUtxo,
          recipient,
          spendType,
          note,
        ),
      );
    } else {
      transactions.push(
        this.buildSplitTransaction(
          stasUtxo,
          satoshisToSend,
          recipient,
          mergeFeeUtxo,
          spendType,
          note,
        ),
      );
    }

    const transferTx = TransactionReader.readHex(
      transactions[transactions.length - 1],
    );
    const feeUtxoOutPoint = this.getFeeOutPoint(transferTx);
    const paidFee = feeUtxo.Satoshis - feeUtxoOutPoint.Satoshis;

    return { transactions, feeSatoshis: paidFee };
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
    const utxos = stasUtxos.map(({ TxId, Vout }) => ({ TxId, Vout }));
    const txIds = Array.from(new Set(stasUtxos.map(({ TxId }) => TxId)));
    const sourceTransactions = await this.getTransactions(txIds);
    const mergeLevels: OutPoint[][] = [[]];

    for (const { TxId, Vout } of utxos) {
      const tx = sourceTransactions[TxId];

      if (!tx) throw new Error(`Transaction ${TxId} not found`);

      mergeLevels[0].push(this.outPointFromTransaction(tx, Vout));
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

          newLevel.push(this.getStasOutPoint(tx));
          mergeTransactions.push(txRaw);

          stasUtxo = this.getStasOutPoint(tx);
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

          newLevel.push(this.getStasOutPoint(tx));
          mergeTransactions.push(txRaw);

          stasUtxo = this.getStasOutPoint(tx);
          feePayment.OutPoint = this.getFeeOutPoint(tx);
        }
      }

      currentLevel = newLevel;
    }

    return { mergeTransactions, mergeFeeUtxo: feePayment.OutPoint, stasUtxo };
  };

  private buildTransferTransaction = (
    stasUtxo: OutPoint,
    feeUtxo: OutPoint,
    recipient: TDstasRecipient,
    spendType: DstasSpendType,
    note?: Bytes[],
  ): string => {
    const destinations = this.buildDestinations(
      stasUtxo,
      [{ recipient, satoshis: stasUtxo.Satoshis, isChange: false }],
      spendType,
    );

    return this.buildStas30Tx({
      stasPayments: [{ OutPoint: stasUtxo, Owner: this.stasWallet }],
      feePayment: { OutPoint: feeUtxo, Owner: this.feeWallet },
      destinations,
      note,
      spendType,
      isMerge: false,
    });
  };

  private buildSplitTransaction = (
    stasUtxo: OutPoint,
    satoshis: number,
    recipient: TDstasRecipient,
    feeUtxo: OutPoint,
    spendType: DstasSpendType,
    note?: Bytes[],
  ): string => {
    const destinations = this.buildDestinations(
      stasUtxo,
      [
        { recipient, satoshis, isChange: false },
        {
          recipient: {
            m: 1,
            addresses: [this.stasWallet.Address],
          },
          satoshis: stasUtxo.Satoshis - satoshis,
          isChange: true,
        },
      ],
      spendType,
    );

    return this.buildStas30Tx({
      stasPayments: [{ OutPoint: stasUtxo, Owner: this.stasWallet }],
      feePayment: { OutPoint: feeUtxo, Owner: this.feeWallet },
      destinations,
      note,
      spendType,
      isMerge: false,
    });
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
  ): OutPoint => {
    const output = tx.Outputs[vout];
    const owner = this.getOwnerAddress(output.LockignScript);

    return new OutPoint(
      tx.Id,
      vout,
      output.LockignScript,
      output.Satoshis,
      owner,
      output.ScriptType,
    );
  };

  private getStasOutPoint = (tx: Transaction): OutPoint => {
    const index = tx.Outputs.findIndex(
      (output) =>
        output.ScriptType !== ScriptType.p2pkh &&
        output.ScriptType !== ScriptType.p2mpkh &&
        output.ScriptType !== ScriptType.nullData,
    );

    if (index === -1) throw new Error("STAS output not found");

    return this.outPointFromTransaction(tx, index);
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
          output.LockignScript,
          output.Satoshis,
          output.Address!,
          output.ScriptType,
        );
      }
    }

    throw new Error("Fee output not found");
  };

  private getOwnerAddress = (lockingScript: Bytes): Address => {
    const tokens = ScriptReader.read(lockingScript);
    const ownerToken = tokens[0];

    if (!ownerToken?.Data || ownerToken.Data.length !== 20) {
      throw new Error("Unable to derive owner PKH from STAS3 locking script");
    }

    return new Address(ownerToken.Data);
  };

  private getDummyFeeUtxo = (): OutPoint => {
    const script = new P2pkhBuilder(this.feeWallet.Address).toBytes();

    return new OutPoint(
      DummyTxId,
      0,
      script,
      5000000000,
      this.feeWallet.Address,
      ScriptType.p2pkh,
    );
  };
}
