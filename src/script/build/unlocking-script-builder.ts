import { OpCode } from "../../bitcoin/op-codes";
import { Bytes } from "../../bytes";
import { ScriptBuilder } from "./script-builder";
import { ScriptType } from "../../bitcoin/script-type";
import {
  extractDstasCounterpartyScript,
  splitDstasPreviousTransactionByCounterpartyScript,
} from "../dstas-swap-script";

export type ScriptChunk = { op: OpCode } | { data: Bytes } | { number: number };

export const buildUnlockingScript = (chunks: ScriptChunk[]): Bytes => {
  const builder = new ScriptBuilder(ScriptType.unknown);

  for (const chunk of chunks) {
    if ("op" in chunk) builder.addOpCode(chunk.op);
    else if ("number" in chunk) builder.addNumber(chunk.number);
    else builder.addData(chunk.data);
  }

  return builder.toBytes();
};

export type TDstasSwapUnlockingScriptRequest = {
  counterpartyOutpointIndex: number;
  counterpartyPieces: Bytes[];
  counterpartyScript: Bytes;
  preimage: Bytes;
  signature: Bytes;
  publicKey: Bytes;
  spendingType?: number;
};

export type TDstasSwapUnlockingScriptFromTransactionRequest = {
  counterpartyOutpointIndex: number;
  counterpartyLockingScript: Bytes | ScriptBuilder;
  counterpartyPreviousTransaction: Bytes;
  preimage: Bytes;
  signature: Bytes;
  publicKey: Bytes;
  spendingType?: number;
};

export type TDstasSwapUnlockingScriptSizeRequest = {
  counterpartyOutpointIndex: number;
  counterpartyPieces: Bytes[];
  counterpartyScript: Bytes;
  preimageLength: number;
  signatureLength?: number;
  publicKeyLength?: number;
  spendingType?: number;
};

export type TDstasSwapUnlockingScriptSizeFromTransactionRequest = {
  counterpartyOutpointIndex: number;
  counterpartyLockingScript: Bytes | ScriptBuilder;
  counterpartyPreviousTransaction: Bytes;
  preimageLength: number;
  signatureLength?: number;
  publicKeyLength?: number;
  spendingType?: number;
};

export const buildDstasSwapUnlockingScript = (
  request: TDstasSwapUnlockingScriptRequest,
): Bytes =>
  buildUnlockingScript([
    { number: request.counterpartyOutpointIndex },
    ...request.counterpartyPieces.map((piece) => ({ data: piece })),
    { number: request.counterpartyPieces.length },
    { data: request.counterpartyScript },
    { data: request.preimage },
    { number: request.spendingType ?? 1 },
    { data: request.signature },
    { data: request.publicKey },
  ]);

export const buildDstasSwapUnlockingScriptFromTransaction = (
  request: TDstasSwapUnlockingScriptFromTransactionRequest,
): Bytes => {
  const counterpartyScript = extractDstasCounterpartyScript(
    request.counterpartyLockingScript,
  );
  const counterpartyPieces =
    splitDstasPreviousTransactionByCounterpartyScript(
      request.counterpartyPreviousTransaction,
      counterpartyScript,
    );

  return buildDstasSwapUnlockingScript({
    counterpartyOutpointIndex: request.counterpartyOutpointIndex,
    counterpartyPieces,
    counterpartyScript,
    preimage: request.preimage,
    signature: request.signature,
    publicKey: request.publicKey,
    spendingType: request.spendingType,
  });
};

export const estimateDstasSwapUnlockingScriptSize = (
  request: TDstasSwapUnlockingScriptSizeRequest,
): number =>
  buildDstasSwapUnlockingScript({
    counterpartyOutpointIndex: request.counterpartyOutpointIndex,
    counterpartyPieces: request.counterpartyPieces,
    counterpartyScript: request.counterpartyScript,
    preimage: new Uint8Array(request.preimageLength),
    signature: new Uint8Array(request.signatureLength ?? 74),
    publicKey: new Uint8Array(request.publicKeyLength ?? 33),
    spendingType: request.spendingType,
  }).length;

export const estimateDstasSwapUnlockingScriptSizeFromTransaction = (
  request: TDstasSwapUnlockingScriptSizeFromTransactionRequest,
): number => {
  const counterpartyScript = extractDstasCounterpartyScript(
    request.counterpartyLockingScript,
  );
  const counterpartyPieces =
    splitDstasPreviousTransactionByCounterpartyScript(
      request.counterpartyPreviousTransaction,
      counterpartyScript,
    );

  return estimateDstasSwapUnlockingScriptSize({
    counterpartyOutpointIndex: request.counterpartyOutpointIndex,
    counterpartyPieces,
    counterpartyScript,
    preimageLength: request.preimageLength,
    signatureLength: request.signatureLength,
    publicKeyLength: request.publicKeyLength,
    spendingType: request.spendingType,
  });
};
