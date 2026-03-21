import { TPayment } from "./bitcoin";
import { Bytes } from "./bytes";
import {
  DstasLockingParams,
  buildDstasLockingTokens,
} from "./script/build/dstas-locking-builder";
import { P2pkhBuilder } from "./script/build/p2pkh-builder";
import { ScriptBuilder } from "./script/build/script-builder";
import { FeeRate } from "./transaction-factory";
import { ScriptType } from "./bitcoin/script-type";
import { TransactionBuilder } from "./transaction/build/transaction-builder";
import { OutputBuilder } from "./transaction/build/output-builder";

export type TDstasAssemblyPayment = TPayment & {
  UnlockingScript?: Bytes;
};

export type TDstasAssemblyDestination = {
  Satoshis: number;
  LockingParams: DstasLockingParams;
};

type TDstasConfigurePhase = "estimate" | "finalize";

export const buildDstasLockingScriptBuilder = (params: DstasLockingParams) => {
  const tokens = buildDstasLockingTokens(params);
  return ScriptBuilder.fromTokens(tokens, ScriptType.dstas);
};

export const validateDstasAmounts = (
  stasPayments: TDstasAssemblyPayment[],
  destinations: { Satoshis: number }[],
) => {
  const inputTotal = stasPayments.reduce(
    (sum, payment) => sum + payment.OutPoint.Satoshis,
    0,
  );
  const outputTotal = destinations.reduce(
    (sum, dest) => sum + dest.Satoshis,
    0,
  );

  if (inputTotal !== outputTotal) {
    throw new Error("Input satoshis must be equal output satoshis");
  }
};

export const buildSignedDstasTransaction = ({
  stasPayments,
  feePayment,
  destinations,
  note,
  feeRate = FeeRate,
  omitChangeOutput = false,
  isMerge = false,
  configureStasInput,
}: {
  stasPayments: TDstasAssemblyPayment[];
  feePayment: TPayment;
  destinations: TDstasAssemblyDestination[];
  note?: Bytes[];
  feeRate?: number;
  omitChangeOutput?: boolean;
  isMerge?: boolean;
  configureStasInput?: (args: {
    phase: TDstasConfigurePhase;
    txBuilder: TransactionBuilder;
    inputIndex: number;
    payment: TDstasAssemblyPayment;
    stasInputIndex: number;
    isMerge: boolean;
  }) => void;
}) => {
  if (stasPayments.length === 0) {
    throw new Error("At least one STAS input is required");
  }
  if (destinations.length === 0) {
    throw new Error("At least one destination is required");
  }

  validateDstasAmounts(stasPayments, destinations);

  const txBuilder = TransactionBuilder.init();
  const stasInputIdxs: number[] = [];

  for (const payment of stasPayments) {
    if (isMerge) {
      txBuilder.addStasMergeInput(payment.OutPoint, payment.Owner);
    } else {
      txBuilder.addInput(payment.OutPoint, payment.Owner);
    }
    stasInputIdxs.push(txBuilder.Inputs.length - 1);
  }

  txBuilder.addInput(feePayment.OutPoint, feePayment.Owner);

  for (const destination of destinations) {
    const lockingScript = buildDstasLockingScriptBuilder(
      destination.LockingParams,
    );
    txBuilder.Outputs.push(
      new OutputBuilder(lockingScript, destination.Satoshis),
    );
  }

  const feeOutputIdx = txBuilder.Outputs.length;
  let changeOutput: OutputBuilder | undefined;

  if (note) {
    txBuilder.addNullDataOutput(note);
  }

  if (!omitChangeOutput) {
    changeOutput = new OutputBuilder(
      new P2pkhBuilder(feePayment.OutPoint.Address),
      feePayment.OutPoint.Satoshis,
    );
    txBuilder.Outputs.splice(feeOutputIdx, 0, changeOutput);
  }

  const runConfigure = (phase: TDstasConfigurePhase) => {
    stasInputIdxs.forEach((inputIndex, stasInputIndex) => {
      configureStasInput?.({
        phase,
        txBuilder,
        inputIndex,
        payment: stasPayments[stasInputIndex],
        stasInputIndex,
        isMerge,
      });
    });
  };

  runConfigure("estimate");

  if (!omitChangeOutput) {
    const fee = txBuilder.getFee(feeRate);
    if (fee >= feePayment.OutPoint.Satoshis) {
      throw new Error(`Insufficient satoshis to pay fee`);
    }
    changeOutput!.Satoshis = feePayment.OutPoint.Satoshis - fee;
  }

  runConfigure("finalize");

  return txBuilder.sign().toHex();
};

export const buildSignedDstasIssueTransaction = ({
  contractOutPoint,
  contractChangeOutPoint,
  contractOwner,
  destinations,
  feeRate = FeeRate,
}: {
  contractOutPoint: TPayment;
  contractChangeOutPoint: TPayment;
  contractOwner: TPayment["Owner"];
  destinations: TDstasAssemblyDestination[];
  feeRate?: number;
}) => {
  if (destinations.length === 0) {
    throw new Error("At least one destination is required");
  }

  const txBuilder = TransactionBuilder.init()
    .addInput(contractOutPoint.OutPoint, contractOwner)
    .addInput(contractChangeOutPoint.OutPoint, contractOwner);

  for (const destination of destinations) {
    const lockingScript = buildDstasLockingScriptBuilder(
      destination.LockingParams,
    );
    txBuilder.Outputs.push(
      new OutputBuilder(lockingScript, destination.Satoshis),
    );
  }

  const feeOutputIdx = txBuilder.Outputs.length;
  txBuilder.addChangeOutputWithFee(
    contractChangeOutPoint.OutPoint.Address,
    contractChangeOutPoint.OutPoint.Satoshis,
    feeRate,
    feeOutputIdx,
  );

  return txBuilder.sign().toHex();
};
