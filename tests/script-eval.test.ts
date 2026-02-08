import {
  createPrevOutputResolverFromTransactions,
  evaluateScripts,
  evaluateTransactionHex,
  PrevOutput,
  SCRIPT_ENABLE_MAGNETIC_OPCODES,
  SCRIPT_ENABLE_MONOLITH_OPCODES,
  SCRIPT_ENABLE_SIGHASH_FORKID,
} from "../src/script";
import { OpCode } from "../src/bitcoin/op-codes";
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

  test("validates known STAS transactions via full-tx api", () => {
    const txMap = buildTxMap();
    const resolvePrevOutput = createPrevOutputResolverFromTransactions(txMap);

    for (const tx of txMap.values()) {
      const hasAllPrevInputs = tx.Inputs.every((input) => {
        const prevTx = txMap.get(input.TxId);
        return prevTx !== undefined && prevTx.Outputs[input.Vout] !== undefined;
      });
      if (!hasAllPrevInputs) continue;

      const result = evaluateTransactionHex(tx.Hex, resolvePrevOutput, {
        allowOpReturn: true,
      });

      if (!result.success) {
        throw new Error(
          `Tx eval failed tx=${tx.Id} errors=${result.errors.join("; ")}`,
        );
      }
    }
  });

  test("fails monolith opcode when monolith flag is disabled", () => {
    const tx = TransactionReader.readHex(stasTxs.SourceTxRaw);
    const result = evaluateScripts(
      new Uint8Array(),
      new Uint8Array([OpCode.OP_1, OpCode.OP_1, OpCode.OP_CAT]),
      { tx, inputIndex: 0, prevOutputs: [] },
      {
        scriptFlags:
          SCRIPT_ENABLE_SIGHASH_FORKID | SCRIPT_ENABLE_MAGNETIC_OPCODES,
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Monolith opcodes disabled");
  });

  test("fails magnetic opcode when magnetic flag is disabled", () => {
    const tx = TransactionReader.readHex(stasTxs.SourceTxRaw);
    const result = evaluateScripts(
      new Uint8Array(),
      new Uint8Array([OpCode.OP_2, OpCode.OP_2, OpCode.OP_MUL]),
      { tx, inputIndex: 0, prevOutputs: [] },
      {
        scriptFlags:
          SCRIPT_ENABLE_SIGHASH_FORKID | SCRIPT_ENABLE_MONOLITH_OPCODES,
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Magnetic opcodes disabled");
  });

  test("fails CHECKSIGVERIFY without FORKID when forkid flag is enabled", () => {
    const tx = TransactionReader.readHex(stasTxs.SourceTxRaw);
    const pubkey = new Uint8Array(33);
    pubkey[0] = 0x02;
    const noForkIdSighashType = new Uint8Array([0x01]);
    const lockingScript = new Uint8Array([
      noForkIdSighashType.length,
      ...noForkIdSighashType,
      pubkey.length,
      ...pubkey,
      OpCode.OP_CHECKSIGVERIFY,
      OpCode.OP_1,
    ]);

    const result = evaluateScripts(
      new Uint8Array(),
      lockingScript,
      { tx, inputIndex: 0, prevOutputs: [] },
      {
        scriptFlags:
          SCRIPT_ENABLE_SIGHASH_FORKID |
          SCRIPT_ENABLE_MAGNETIC_OPCODES |
          SCRIPT_ENABLE_MONOLITH_OPCODES,
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("missing FORKID");
  });
});
