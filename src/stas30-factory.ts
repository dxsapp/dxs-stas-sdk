import { TPayment } from "./bitcoin";
import { ScriptType } from "./bitcoin/script-type";
import { Bytes } from "./bytes";
import {
  Stas3FreezeMultisigParams,
  buildStas3FreezeMultisigScript,
} from "./script/build/stas3-freeze-multisig-builder";
import { ScriptBuilder } from "./script/build/script-builder";
import { ScriptReader } from "./script/read/script-reader";
import { TransactionBuilder } from "./transaction/build/transaction-builder";
import { OutputBuilder } from "./transaction/build/output-builder";
import { FeeRate } from "./transaction-factory";

export type TStas3Payment = TPayment & {
  UnlockingScript?: Bytes;
};

export type TStas3Destination = {
  Satoshis: number;
  LockingParams: Stas3FreezeMultisigParams;
};

export type TBuildStas3BaseTxRequest = {
  stasPayments: TStas3Payment[];
  feePayment: TPayment;
  destinations: TStas3Destination[];
  note?: Bytes[];
  feeRate?: number;
};

const resolveUnlockingScript = (payment: TStas3Payment): Bytes => {
  if (payment.UnlockingScript) return payment.UnlockingScript;

  throw new Error("UnlockingScript must be provided");
};

const buildStas3LockingScriptBuilder = (params: Stas3FreezeMultisigParams) => {
  const scriptBytes = buildStas3FreezeMultisigScript(params);
  const tokens = ScriptReader.read(scriptBytes);
  return ScriptBuilder.fromTokens(tokens, ScriptType.unknown);
};

const validateStas3Amounts = (
  stasPayments: TStas3Payment[],
  destinations: TStas3Destination[],
) => {
  const inputTotal = stasPayments.reduce(
    (sum, p) => sum + p.OutPoint.Satoshis,
    0,
  );
  const outputTotal = destinations.reduce((sum, d) => sum + d.Satoshis, 0);

  if (inputTotal !== outputTotal)
    throw new Error("Input satoshis must be equal output satoshis");
};

export const BuildStas3BaseTx = ({
  stasPayments,
  feePayment,
  destinations,
  note,
  feeRate,
}: TBuildStas3BaseTxRequest) => {
  if (stasPayments.length === 0)
    throw new Error("At least one STAS input is required");
  if (destinations.length === 0)
    throw new Error("At least one destination is required");

  validateStas3Amounts(stasPayments, destinations);

  const txBuilder = TransactionBuilder.init();
  const stasInputIdxs: number[] = [];

  for (const payment of stasPayments) {
    txBuilder.addInput(payment.OutPoint, payment.Owner);
    stasInputIdxs.push(txBuilder.Inputs.length - 1);
  }

  txBuilder.addInput(feePayment.OutPoint, feePayment.Owner);

  for (const dest of destinations) {
    const lockingScript = buildStas3LockingScriptBuilder(dest.LockingParams);
    txBuilder.Outputs.push(new OutputBuilder(lockingScript, dest.Satoshis));
  }

  const feeOutputIdx = txBuilder.Outputs.length;

  if (note) txBuilder.addNullDataOutput(note!);

  txBuilder.addChangeOutputWithFee(
    feePayment.OutPoint.Address,
    feePayment.OutPoint.Satoshis,
    feeRate ?? FeeRate,
    feeOutputIdx,
  );

  stasInputIdxs.forEach((idx, i) => {
    const payment = stasPayments[i];
    txBuilder.Inputs[idx].UnlockingScript = resolveUnlockingScript(payment);
  });

  return txBuilder.sign().toHex();
};

// Explicit semantic wrappers for readability
export type TBuildStas3FreezeTxRequest = TBuildStas3BaseTxRequest;
/**
 * Freeze: provide STAS3 unlocking scripts that encode spending-type=2
 * and authority/signature fields as required by the template.
 */
export const BuildStas3FreezeTx = (request: TBuildStas3FreezeTxRequest) =>
  BuildStas3BaseTx(request);

export type TBuildStas3UnfreezeTxRequest = TBuildStas3BaseTxRequest;
/**
 * Unfreeze: provide STAS3 unlocking scripts that encode spending-type=2
 * and authority/signature fields as required by the template.
 */
export const BuildStas3UnfreezeTx = (request: TBuildStas3UnfreezeTxRequest) =>
  BuildStas3BaseTx(request);

export type TBuildStas3SwapTxRequest = TBuildStas3BaseTxRequest;
/**
 * Swap/cancel: provide STAS3 unlocking scripts that encode spending-type=4
 * (or the issuer-defined swap variant).
 */
export const BuildStas3SwapTx = (request: TBuildStas3SwapTxRequest) =>
  BuildStas3BaseTx(request);

export type TBuildStas3MultisigTxRequest = TBuildStas3BaseTxRequest;
/**
 * Multisig: provide STAS3 unlocking scripts that include the required
 * M-of-N signatures and any protocol-specific fields.
 */
export const BuildStas3MultisigTx = (request: TBuildStas3MultisigTxRequest) =>
  BuildStas3BaseTx(request);

export type TBuildStas3TransferTxRequest = {
  stasPayment: TStas3Payment;
  feePayment: TPayment;
  destination: TStas3Destination;
  note?: Bytes[];
  feeRate?: number;
};

export const BuildStas3TransferTx = ({
  stasPayment,
  feePayment,
  destination,
  note,
  feeRate,
}: TBuildStas3TransferTxRequest) =>
  BuildStas3BaseTx({
    stasPayments: [stasPayment],
    feePayment,
    destinations: [destination],
    note,
    feeRate,
  });

export type TBuildStas3SplitTxRequest = {
  stasPayment: TStas3Payment;
  feePayment: TPayment;
  destinations: TStas3Destination[];
  note?: Bytes[];
  feeRate?: number;
};

export const BuildStas3SplitTx = ({
  stasPayment,
  feePayment,
  destinations,
  note,
  feeRate,
}: TBuildStas3SplitTxRequest) =>
  BuildStas3BaseTx({
    stasPayments: [stasPayment],
    feePayment,
    destinations,
    note,
    feeRate,
  });

export type TBuildStas3MergeTxRequest = {
  stasPayments: TStas3Payment[];
  feePayment: TPayment;
  destinations: TStas3Destination[];
  note?: Bytes[];
  feeRate?: number;
};

export const BuildStas3MergeTx = ({
  stasPayments,
  feePayment,
  destinations,
  note,
  feeRate,
}: TBuildStas3MergeTxRequest) =>
  BuildStas3BaseTx({
    stasPayments,
    feePayment,
    destinations,
    note,
    feeRate,
  });
