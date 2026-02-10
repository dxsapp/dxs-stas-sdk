import { Address, OutPoint, TPayment, TokenScheme } from "./bitcoin";
import { ScriptType } from "./bitcoin/script-type";
import { Bytes, fromHex, toHex } from "./bytes";
import {
  SecondFieldInput,
  Stas3FreezeMultisigParams,
  buildStas3Flags,
  buildStas3FreezeMultisigTokens,
} from "./script/build/stas3-freeze-multisig-builder";
import { ScriptBuilder } from "./script/build/script-builder";
import { TransactionBuilder } from "./transaction/build/transaction-builder";
import { OutputBuilder } from "./transaction/build/output-builder";
import { TransactionReader } from "./transaction/read/transaction-reader";
import { FeeRate } from "./transaction-factory";
import { hash160 } from "./hashes";

export type TDstasPayment = TPayment & {
  UnlockingScript?: Bytes;
};

export type TDstasDestinationByLockingParams = {
  Satoshis: number;
  LockingParams: Stas3FreezeMultisigParams;
};

export type TDstasDestinationByScheme = {
  Satoshis: number;
  To?: Address;
  ToOwner?: Bytes;
  ToOwnerMultisig?: {
    m: number;
    publicKeys: string[];
  };
  SecondField?: SecondFieldInput;
  Frozen?: boolean;
  OptionalData?: Bytes[];
};

export type TDstasDestination =
  | TDstasDestinationByLockingParams
  | TDstasDestinationByScheme;

export type TBuildDstasBaseTxRequest = {
  stasPayments: TDstasPayment[];
  feePayment: TPayment;
  destinations: TDstasDestination[];
  Scheme?: TokenScheme;
  spendingType?: number;
  note?: Bytes[];
  feeRate?: number;
  omitChangeOutput?: boolean;
};

export type TBuildDstasIssueTxsRequest = {
  fundingPayment: TPayment;
  scheme: TokenScheme;
  destinations: TDstasDestinationByScheme[];
  feeRate?: number;
};

export type TBuildDstasIssueTxsResult = {
  contractTxHex: string;
  issueTxHex: string;
};

const resolveUnlockingScript = (payment: TDstasPayment): Bytes | undefined =>
  payment.UnlockingScript;

const buildStas3LockingScriptBuilder = (params: Stas3FreezeMultisigParams) => {
  const tokens = buildStas3FreezeMultisigTokens(params);
  return ScriptBuilder.fromTokens(tokens, ScriptType.dstas);
};

const deriveFlagsFromScheme = (scheme: TokenScheme): Bytes =>
  buildStas3Flags({ freezable: scheme.Freeze });

const deriveServiceFieldsFromScheme = (scheme: TokenScheme): Bytes[] => {
  if (!scheme.Freeze) return [];

  const authority = scheme.Authority;
  const keys = authority?.publicKeys ?? [];
  if (keys.length === 0) {
    throw new Error(
      "Freeze-enabled scheme must define authority public keys for service field derivation",
    );
  }

  if ((authority?.m ?? 1) !== 1) {
    const m = authority!.m;
    const n = keys.length;
    if (m <= 0 || m > n) {
      throw new Error(
        `Freeze-enabled scheme has invalid authority threshold m=${m}, n=${n}`,
      );
    }

    const preimage = new Uint8Array(1 + n * (1 + 33) + 1);
    let offset = 0;
    preimage[offset++] = m & 0xff;

    for (const keyHex of keys) {
      const key = fromHex(keyHex);
      if (key.length !== 33) {
        throw new Error(
          `Authority public key must be 33 bytes, got ${key.length}`,
        );
      }
      preimage[offset++] = 0x21;
      preimage.set(key, offset);
      offset += key.length;
    }

    preimage[offset] = n & 0xff;

    return [hash160(preimage)];
  }

  return [hash160(fromHex(keys[0]))];
};

const resolveLockingParams = (
  dest: TDstasDestination,
  schemeFromRequest?: TokenScheme,
): Stas3FreezeMultisigParams => {
  if ("LockingParams" in dest) return dest.LockingParams;

  const scheme = schemeFromRequest;
  if (!scheme) {
    throw new Error(
      "Scheme must be provided at request level when destination does not define LockingParams",
    );
  }
  const ownerFromMultisig = (() => {
    if (!dest.ToOwnerMultisig) return undefined;

    const { m, publicKeys } = dest.ToOwnerMultisig;
    if (publicKeys.length === 0) {
      throw new Error("ToOwnerMultisig.publicKeys must not be empty");
    }
    if (m <= 0 || m > publicKeys.length) {
      throw new Error(
        `ToOwnerMultisig has invalid threshold m=${m}, n=${publicKeys.length}`,
      );
    }

    const preimage = new Uint8Array(1 + publicKeys.length * (1 + 33) + 1);
    let off = 0;
    preimage[off++] = m & 0xff;
    for (const keyHex of publicKeys) {
      const key = fromHex(keyHex);
      if (key.length !== 33) {
        throw new Error(
          `ToOwnerMultisig public key must be 33 bytes, got ${key.length}`,
        );
      }
      preimage[off++] = 0x21;
      preimage.set(key, off);
      off += key.length;
    }
    preimage[off] = publicKeys.length & 0xff;
    return hash160(preimage);
  })();

  const owner = dest.ToOwner ?? ownerFromMultisig ?? dest.To?.Hash160;
  if (!owner) {
    throw new Error(
      "Destination must provide To (address) or ToOwner (raw owner field bytes)",
    );
  }

  return {
    owner,
    secondField: dest.SecondField ?? null,
    redemptionPkh: fromHex(scheme.TokenId),
    frozen: dest.Frozen === true,
    flags: deriveFlagsFromScheme(scheme),
    serviceFields: deriveServiceFieldsFromScheme(scheme),
    optionalData: dest.OptionalData !== undefined ? dest.OptionalData : [],
  };
};

const validateStas3Amounts = (
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

const validateFundingAgainstScheme = (
  fundingPayment: TPayment,
  scheme: TokenScheme,
) => {
  const issuerTokenId = toHex(fundingPayment.OutPoint.Address.Hash160);
  if (issuerTokenId.toLowerCase() !== scheme.TokenId.toLowerCase()) {
    throw new Error(
      `scheme.TokenId must match issuer address hash160 (${issuerTokenId})`,
    );
  }
};

export const BuildDstasBaseTx = ({
  stasPayments,
  feePayment,
  destinations,
  Scheme,
  spendingType,
  note,
  feeRate = FeeRate,
  omitChangeOutput = false,
}: TBuildDstasBaseTxRequest) => {
  if (stasPayments.length === 0)
    throw new Error("At least one STAS input is required");
  if (destinations.length === 0)
    throw new Error("At least one destination is required");

  validateStas3Amounts(stasPayments, destinations);

  const txBuilder = TransactionBuilder.init();
  const stasInputIdxs: number[] = [];

  for (const payment of stasPayments) {
    if (stasPayments.length > 1) {
      txBuilder.addStasMergeInput(payment.OutPoint, payment.Owner);
    } else {
      txBuilder.addInput(payment.OutPoint, payment.Owner);
    }
    stasInputIdxs.push(txBuilder.Inputs.length - 1);
  }

  txBuilder.addInput(feePayment.OutPoint, feePayment.Owner);

  for (const dest of destinations) {
    const lockingScript = buildStas3LockingScriptBuilder(
      resolveLockingParams(dest, Scheme),
    );
    txBuilder.Outputs.push(new OutputBuilder(lockingScript, dest.Satoshis));
  }

  const feeOutputIdx = txBuilder.Outputs.length;

  if (note) txBuilder.addNullDataOutput(note!);

  if (!omitChangeOutput) {
    txBuilder.addChangeOutputWithFee(
      feePayment.OutPoint.Address,
      feePayment.OutPoint.Satoshis,
      feeRate,
      feeOutputIdx,
    );
  }

  stasInputIdxs.forEach((idx, i) => {
    const payment = stasPayments[i];
    txBuilder.Inputs[idx].DstasSpendingType = spendingType ?? 1;
    const unlocking = resolveUnlockingScript(payment);
    if (unlocking) txBuilder.Inputs[idx].UnlockingScript = unlocking;
  });

  return txBuilder.sign().toHex();
};

export const BuildDstasIssueTxs = ({
  fundingPayment,
  scheme,
  destinations,
  feeRate = FeeRate,
}: TBuildDstasIssueTxsRequest): TBuildDstasIssueTxsResult => {
  if (destinations.length === 0)
    throw new Error("At least one destination is required");

  validateFundingAgainstScheme(fundingPayment, scheme);

  const totalIssueSatoshis = destinations.reduce(
    (sum, d) => sum + d.Satoshis,
    0,
  );
  const contractChangeBudget =
    fundingPayment.OutPoint.Satoshis - totalIssueSatoshis;
  if (contractChangeBudget <= 0) {
    throw new Error(
      "Funding output must be greater than total tokenized satoshis",
    );
  }

  const contractTxHex = TransactionBuilder.init()
    .addInput(fundingPayment.OutPoint, fundingPayment.Owner)
    .addP2PkhOutput(totalIssueSatoshis, fundingPayment.OutPoint.Address, [
      scheme.toBytes(),
    ])
    .addChangeOutputWithFee(
      fundingPayment.OutPoint.Address,
      contractChangeBudget,
      feeRate,
    )
    .sign()
    .toHex();

  const contractTx = TransactionReader.readHex(contractTxHex);
  const contractOutPoint = new OutPoint(
    contractTx.Id,
    0,
    contractTx.Outputs[0].LockignScript,
    contractTx.Outputs[0].Satoshis,
    fundingPayment.OutPoint.Address,
    ScriptType.p2pkh,
  );
  const contractChangeOutput = contractTx.Outputs[1];
  if (!contractChangeOutput) {
    throw new Error(
      "Contract tx does not have a change output to fund issue tx fee",
    );
  }
  const contractChangeOutPoint = new OutPoint(
    contractTx.Id,
    1,
    contractChangeOutput.LockignScript,
    contractChangeOutput.Satoshis,
    fundingPayment.OutPoint.Address,
    ScriptType.p2pkh,
  );

  const issueBuilder = TransactionBuilder.init()
    .addInput(contractOutPoint, fundingPayment.Owner)
    .addInput(contractChangeOutPoint, fundingPayment.Owner);

  for (const dest of destinations) {
    const lockingScript = buildStas3LockingScriptBuilder(
      resolveLockingParams(dest, scheme),
    );
    issueBuilder.Outputs.push(new OutputBuilder(lockingScript, dest.Satoshis));
  }

  const feeOutputIdx = issueBuilder.Outputs.length;

  issueBuilder.addChangeOutputWithFee(
    contractChangeOutPoint.Address,
    contractChangeOutPoint.Satoshis,
    feeRate,
    feeOutputIdx,
  );

  const issueTxHex = issueBuilder.sign().toHex();

  return { contractTxHex, issueTxHex };
};

// Explicit semantic wrappers for readability
export type TBuildDstasFreezeTxRequest = TBuildDstasBaseTxRequest;
/**
 * Freeze: provide STAS3 unlocking scripts that encode spending-type=2
 * and authority/signature fields as required by the template.
 */
export const BuildDstasFreezeTx = (request: TBuildDstasFreezeTxRequest) =>
  BuildDstasBaseTx({ ...request, spendingType: 2 });

export type TBuildDstasUnfreezeTxRequest = TBuildDstasBaseTxRequest;
/**
 * Unfreeze: provide STAS3 unlocking scripts that encode spending-type=2
 * and authority/signature fields as required by the template.
 */
export const BuildDstasUnfreezeTx = (request: TBuildDstasUnfreezeTxRequest) =>
  BuildDstasBaseTx({ ...request, spendingType: 2 });

export type TBuildDstasSwapTxRequest = TBuildDstasBaseTxRequest;
/**
 * Swap/cancel: provide STAS3 unlocking scripts that encode spending-type=4
 * (or the issuer-defined swap variant).
 */
export const BuildDstasSwapTx = (request: TBuildDstasSwapTxRequest) =>
  BuildDstasBaseTx({ ...request, spendingType: 4 });

export type TDstasSwapDestination = {
  Satoshis: number;
  Owner: Bytes;
  TokenIdHex: string;
  Freezable: boolean;
  AuthorityServiceField: Bytes;
  SecondField?: SecondFieldInput;
  OptionalData?: Bytes[];
};

export type TBuildDstasSwapFlowTxRequest = {
  stasPayments: [TDstasPayment, TDstasPayment];
  feePayment: TPayment;
  destinations: TDstasSwapDestination[];
  note?: Bytes[];
  feeRate?: number;
  omitChangeOutput?: boolean;
};

const toSwapFlowDestination = (
  value: TDstasSwapDestination,
): TDstasDestinationByLockingParams => ({
  Satoshis: value.Satoshis,
  LockingParams: {
    owner: value.Owner,
    secondField: value.SecondField !== undefined ? value.SecondField : null,
    redemptionPkh: fromHex(value.TokenIdHex),
    flags: buildStas3Flags({ freezable: value.Freezable }),
    serviceFields: [value.AuthorityServiceField],
    optionalData: value.OptionalData ?? [],
  },
});

/**
 * Build swap flow where one side performs a transfer path (spending-type=1)
 * and the other side is consumed via swap request matching.
 */
export const BuildDstasTransferSwapTx = ({
  stasPayments,
  feePayment,
  destinations,
  note,
  feeRate,
  omitChangeOutput,
}: TBuildDstasSwapFlowTxRequest) =>
  BuildDstasBaseTx({
    stasPayments,
    feePayment,
    destinations: destinations.map(toSwapFlowDestination),
    note,
    feeRate,
    omitChangeOutput,
    spendingType: 1,
  });

/**
 * Build swap flow where both sides are interpreted as swap path (spending-type=4).
 */
export const BuildDstasSwapSwapTx = ({
  stasPayments,
  feePayment,
  destinations,
  note,
  feeRate,
  omitChangeOutput,
}: TBuildDstasSwapFlowTxRequest) =>
  BuildDstasBaseTx({
    stasPayments,
    feePayment,
    destinations: destinations.map(toSwapFlowDestination),
    note,
    feeRate,
    omitChangeOutput,
    spendingType: 4,
  });

export type TBuildDstasMultisigTxRequest = TBuildDstasBaseTxRequest;
/**
 * Multisig: provide STAS3 unlocking scripts that include the required
 * M-of-N signatures and any protocol-specific fields.
 */
export const BuildDstasMultisigTx = (request: TBuildDstasMultisigTxRequest) =>
  BuildDstasBaseTx(request);

export type TBuildDstasTransferTxRequest = {
  stasPayment: TDstasPayment;
  feePayment: TPayment;
  destination: TDstasDestination;
  Scheme?: TokenScheme;
  note?: Bytes[];
  feeRate?: number;
  omitChangeOutput?: boolean;
};

export const BuildDstasTransferTx = ({
  stasPayment,
  feePayment,
  destination,
  Scheme,
  note,
  feeRate,
  omitChangeOutput,
}: TBuildDstasTransferTxRequest) =>
  BuildDstasBaseTx({
    stasPayments: [stasPayment],
    feePayment,
    destinations: [destination],
    Scheme,
    note,
    feeRate,
    omitChangeOutput,
  });

export type TBuildDstasSplitTxRequest = {
  stasPayment: TDstasPayment;
  feePayment: TPayment;
  destinations: TDstasDestination[];
  Scheme?: TokenScheme;
  note?: Bytes[];
  feeRate?: number;
};

export const BuildDstasSplitTx = ({
  stasPayment,
  feePayment,
  destinations,
  Scheme,
  note,
  feeRate,
}: TBuildDstasSplitTxRequest) =>
  BuildDstasBaseTx({
    stasPayments: [stasPayment],
    feePayment,
    destinations,
    Scheme,
    note,
    feeRate,
  });

export type TBuildDstasMergeTxRequest = {
  stasPayments: TDstasPayment[];
  feePayment: TPayment;
  destinations: TDstasDestination[];
  Scheme?: TokenScheme;
  note?: Bytes[];
  feeRate?: number;
};

export const BuildDstasMergeTx = ({
  stasPayments,
  feePayment,
  destinations,
  Scheme,
  note,
  feeRate,
}: TBuildDstasMergeTxRequest) =>
  BuildDstasBaseTx({
    stasPayments,
    feePayment,
    destinations,
    Scheme,
    note,
    feeRate,
  });
