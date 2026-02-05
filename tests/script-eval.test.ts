import { evaluateScripts, PrevOutput } from "../src/script";
import { toHex } from "../src/bytes";
import { TransactionReader } from "../src/transaction/read/transaction-reader";
import { Transaction } from "../src/bitcoin/transaction";
import * as stasTxs from "./stas-transactios";

const buildTxMap = () => {
  const txMap = new Map<string, Transaction>();
  for (const value of Object.values(stasTxs)) {
    if (typeof value !== "string") continue;
    const tx = TransactionReader.readHex(value);
    txMap.set(tx.Id, tx);
  }
  return txMap;
};

const buildPrevOutputs = (tx: Transaction, txMap: Map<string, Transaction>) =>
  tx.Inputs.map((input) => {
    const prevTx = txMap.get(input.TxId);
    if (!prevTx) return null;
    const output = prevTx.Outputs[input.Vout];
    if (!output) return null;
    return {
      lockingScript: output.LockignScript,
      satoshis: output.Satoshis,
    };
  });

describe("script evaluator", () => {
  test("validates known STAS transactions", () => {
    const txMap = buildTxMap();
    for (const tx of txMap.values()) {
      const prevOutputs = buildPrevOutputs(tx, txMap);
      if (prevOutputs.some((p) => p === null)) continue;
      const ctxPrevOutputs = prevOutputs as PrevOutput[];

      for (let i = 0; i < tx.Inputs.length; i++) {
        const prev = prevOutputs[i];
        if (!prev) continue;
        const result = evaluateScripts(
          tx.Inputs[i].UnlockingScript,
          prev.lockingScript,
          {
            tx,
            inputIndex: i,
            prevOutputs: ctxPrevOutputs,
          },
          { allowOpReturn: true },
        );

        if (!result.success) {
          throw new Error(
            `Script eval failed tx=${tx.Id} input=${i} error=${result.error} lockingScript=${toHex(prev.lockingScript)}`,
          );
        }
      }
    }
  });
});
