import {
  Address,
  OutPoint,
  ScriptType,
  TDestination,
  TokenScheme,
  TPayment,
  Transaction,
  Wallet,
} from "./bitcoin";
import { TransactionBuilder, TransactionReader } from "./transaction";
import {
  BuildMergeTx,
  BuildSplitTx,
  BuildTransferTx,
  FeeRate,
} from "./transaction-factory";
import { Bytes, fromHex } from "./bytes";

export const AvgFeeForMerge = 500;

export type TFundingUtxoRequest = {
  utxoIdsToSpend: string[];
  estimatedFeeSatoshis: number;
  transactionsCount: number;
};
export type TGetUtxoFunction = (satoshis?: number) => Promise<OutPoint[]>;
export type TGetFundingUtxoFunction = (
  request: TFundingUtxoRequest,
) => Promise<OutPoint>;
export type TGetTransactionsFunction = (
  ids: string[],
) => Promise<Record<string, Transaction>>;
export type TStasPayoutBundle = {
  transactions?: string[];
  feeSatoshis: number;
  message?: string;
  devMessage?: string;
};

export class StasBundleFactory {
  constructor(
    private readonly tokenScheme: TokenScheme,
    private readonly stasWallet: Wallet,
    private readonly feeWallet: Wallet,
    private readonly getFundingUtxo: TGetFundingUtxoFunction,
    private readonly getStasUtxoSet: TGetUtxoFunction,
    private readonly getTransactions: TGetTransactionsFunction,
  ) {}

  public createBundle = async (
    amountSatoshis: number,
    to: Address,
    note?: Bytes[],
  ): Promise<TStasPayoutBundle> => {
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
      new OutPoint(
        "4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b",
        0,
        fromHex("76a91462e907b15cbf27d5425399ebf6f0fb50ebb88f1888ac"),
        5000000000,
        this.feeWallet.Address,
        ScriptType.p2pkh,
      ),
      to,
      note,
    );

    const adjustedEstimatedFee =
      estimatedFee + stasUtxos.length * 9 + 1; /* Fee for fee transactio */
    const fudingUtxo = await this.getFundingUtxo({
      utxoIdsToSpend: stasUtxos.map((x) => `${x.TxId}:${x.Vout}`),
      estimatedFeeSatoshis: adjustedEstimatedFee + 1,
      transactionsCount,
    });

    // if (estimatedFee > feeSatoshis) {
    //   return {
    //     message: "Insufficient balance to pay fee",
    //     devMessage: `Insufficient balance to pay fee. Estimated: ${estimatedFee}; balance: ${feeSatoshis}`,
    //     feeSatoshis: 0,
    //   };
    // }

    const transactions: string[] = [];

    return this._createBundle(
      transactions,
      stasUtxos,
      amountSatoshis,
      fudingUtxo,
      to,
      note,
    );
  };

  private _createBundle = async (
    transactions: string[],
    stasUtxos: OutPoint[],
    satoshisToSend: number,
    feeUtxo: OutPoint,
    to: Address,
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
        this.buildTransferTransaction(stasUtxo, mergeFeeUtxo, to, note),
      );
    } else {
      transactions.push(
        this.buildSplitTransaction(
          stasUtxo,
          satoshisToSend,
          to,
          mergeFeeUtxo,
          note,
        ),
      );
    }

    const transferTx = TransactionReader.readHex(
      transactions[transactions.length - 1],
    );
    const feeUtxoIdx = note
      ? transferTx.Outputs.length - 2
      : transferTx.Outputs.length - 1;
    const paidFee = feeUtxo.Satoshis - transferTx.Outputs[feeUtxoIdx].Satoshis;

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

  private buildFeeTransaction = (
    utxos: OutPoint[],
    satoshis: number,
  ): {
    feeTransaction?: string;
    feeUtxo: OutPoint;
  } => {
    if (utxos.length === 1)
      return {
        feeUtxo: utxos[0],
      };

    const txBuilder = TransactionBuilder.init().addP2PkhOutput(
      0,
      this.feeWallet.Address,
    );
    let accumulated = 0;

    for (const utxo of utxos) {
      txBuilder.addInput(utxo, this.feeWallet);

      const fee = txBuilder.getFee(FeeRate);

      accumulated += utxo.Satoshis;

      if (accumulated - fee >= satoshis) break;
    }

    txBuilder.Outputs = [];

    const result = txBuilder
      .addChangeOutputWithFee(this.feeWallet.Address, accumulated, FeeRate)
      .sign()
      .toHex();

    return { feeTransaction: result, feeUtxo: OutPoint.fromHex(result, 0) };
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

      mergeLevels[0].push(OutPoint.fromTransaction(tx, Vout));
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
          const stasPayment: TPayment = {
            OutPoint: outPoint,
            Owner: this.stasWallet,
          };
          const txRaw = BuildTransferTx({
            tokenScheme: this.tokenScheme,
            stasPayment,
            feePayment,
            to: this.stasWallet.Address,
          });
          const tx = TransactionReader.readHex(txRaw);

          newLevel.push(OutPoint.fromTransaction(tx, 0));
          mergeTransactions.push(txRaw);

          stasUtxo = OutPoint.fromTransaction(tx, 0);
          feePayment.OutPoint = OutPoint.fromTransaction(tx, 1);
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

          let destination: TDestination = {
            Address: this.stasWallet.Address,
            Satoshis: inputSatoshis,
          };
          let splitDestination: TDestination | undefined;

          if (lastMerge && inputSatoshis !== satoshis) {
            destination = {
              Address: this.stasWallet.Address,
              Satoshis: satoshis,
            };
            splitDestination = {
              Address: this.stasWallet.Address,
              Satoshis: inputSatoshis - satoshis,
            };
          }

          const txRaw = BuildMergeTx({
            tokenScheme: this.tokenScheme,
            outPoint1,
            outPoint2,
            owner: this.stasWallet,
            feePayment,
            destination,
            splitDestination,
          });
          const tx = TransactionReader.readHex(txRaw);

          newLevel.push(OutPoint.fromTransaction(tx, 0));
          mergeTransactions.push(txRaw);

          stasUtxo = OutPoint.fromTransaction(tx, 0);
          feePayment.OutPoint = OutPoint.fromTransaction(
            tx,
            tx.Outputs.length - 1,
          );
        }
      }

      currentLevel = newLevel;
    }

    return { mergeTransactions, mergeFeeUtxo: feePayment.OutPoint, stasUtxo };
  };

  private buildTransferTransaction = (
    stasUtxo: OutPoint,
    feeUtxo: OutPoint,
    to: Address,
    note?: Bytes[],
  ): string =>
    BuildTransferTx({
      tokenScheme: this.tokenScheme,
      stasPayment: { OutPoint: stasUtxo, Owner: this.stasWallet },
      feePayment: { OutPoint: feeUtxo, Owner: this.feeWallet },
      to,
      note,
    });

  private buildSplitTransaction = (
    stasUtxo: OutPoint,
    satoshis: number,
    to: Address,
    feeUtxo: OutPoint,
    note?: Bytes[],
  ): string =>
    BuildSplitTx({
      tokenScheme: this.tokenScheme,
      stasPayment: { OutPoint: stasUtxo, Owner: this.stasWallet },
      feePayment: { OutPoint: feeUtxo, Owner: this.feeWallet },
      destinations: [
        { Satoshis: satoshis, Address: to },
        {
          Satoshis: stasUtxo.Satoshis - satoshis,
          Address: this.stasWallet.Address,
        },
      ],
      note,
    });
}
