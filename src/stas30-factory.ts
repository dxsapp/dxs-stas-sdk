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

export type TStas3Payment = TPayment & {
  UnlockingScript?: Bytes;
};

export type TStas3DestinationByLockingParams = {
  Satoshis: number;
  LockingParams: Stas3FreezeMultisigParams;
};

export type TStas3DestinationByScheme = {
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

export type TStas3Destination =
  | TStas3DestinationByLockingParams
  | TStas3DestinationByScheme;

export type TBuildStas3BaseTxRequest = {
  stasPayments: TStas3Payment[];
  feePayment: TPayment;
  destinations: TStas3Destination[];
  Scheme?: TokenScheme;
  spendingType?: number;
  note?: Bytes[];
  feeRate?: number;
  omitChangeOutput?: boolean;
};

export type TBuildStas3IssueTxsRequest = {
  fundingPayment: TPayment;
  scheme: TokenScheme;
  destinations: TStas3DestinationByScheme[];
  feeRate?: number;
};

export type TBuildStas3IssueTxsResult = {
  contractTxHex: string;
  issueTxHex: string;
};

const resolveUnlockingScript = (payment: TStas3Payment): Bytes | undefined =>
  payment.UnlockingScript;

const buildStas3LockingScriptBuilder = (params: Stas3FreezeMultisigParams) => {
  const tokens = buildStas3FreezeMultisigTokens(params);
  return ScriptBuilder.fromTokens(tokens, ScriptType.p2stas30);
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
  dest: TStas3Destination,
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

export const BuildStas3BaseTx = ({
  stasPayments,
  feePayment,
  destinations,
  Scheme,
  spendingType,
  note,
  feeRate = FeeRate,
  omitChangeOutput = false,
}: TBuildStas3BaseTxRequest) => {
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
    txBuilder.Inputs[idx].Stas30SpendingType = spendingType ?? 1;
    const unlocking = resolveUnlockingScript(payment);
    if (unlocking) txBuilder.Inputs[idx].UnlockingScript = unlocking;
  });

  return txBuilder.sign().toHex();
};

export const BuildStas3IssueTxs = ({
  fundingPayment,
  scheme,
  destinations,
  feeRate = FeeRate,
}: TBuildStas3IssueTxsRequest): TBuildStas3IssueTxsResult => {
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
export type TBuildStas3FreezeTxRequest = TBuildStas3BaseTxRequest;
/**
 * Freeze: provide STAS3 unlocking scripts that encode spending-type=2
 * and authority/signature fields as required by the template.
 */
export const BuildStas3FreezeTx = (request: TBuildStas3FreezeTxRequest) =>
  BuildStas3BaseTx({ ...request, spendingType: 2 });

export type TBuildStas3UnfreezeTxRequest = TBuildStas3BaseTxRequest;
/**
 * Unfreeze: provide STAS3 unlocking scripts that encode spending-type=2
 * and authority/signature fields as required by the template.
 */
export const BuildStas3UnfreezeTx = (request: TBuildStas3UnfreezeTxRequest) =>
  BuildStas3BaseTx({ ...request, spendingType: 2 });

export type TBuildStas3SwapTxRequest = TBuildStas3BaseTxRequest;
/**
 * Swap/cancel: provide STAS3 unlocking scripts that encode spending-type=4
 * (or the issuer-defined swap variant).
 */
export const BuildStas3SwapTx = (request: TBuildStas3SwapTxRequest) =>
  BuildStas3BaseTx({ ...request, spendingType: 4 });

export type TStas3SwapDestination = {
  Satoshis: number;
  Owner: Bytes;
  TokenIdHex: string;
  Freezable: boolean;
  AuthorityServiceField: Bytes;
  SecondField?: SecondFieldInput;
  OptionalData?: Bytes[];
};

export type TBuildStas3SwapFlowTxRequest = {
  stasPayments: [TStas3Payment, TStas3Payment];
  feePayment: TPayment;
  destinations: TStas3SwapDestination[];
  note?: Bytes[];
  feeRate?: number;
  omitChangeOutput?: boolean;
};

const toSwapFlowDestination = (
  value: TStas3SwapDestination,
): TStas3DestinationByLockingParams => ({
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
export const BuildStas3TransferSwapTx = ({
  stasPayments,
  feePayment,
  destinations,
  note,
  feeRate,
  omitChangeOutput,
}: TBuildStas3SwapFlowTxRequest) =>
  BuildStas3BaseTx({
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
export const BuildStas3SwapSwapTx = ({
  stasPayments,
  feePayment,
  destinations,
  note,
  feeRate,
  omitChangeOutput,
}: TBuildStas3SwapFlowTxRequest) =>
  BuildStas3BaseTx({
    stasPayments,
    feePayment,
    destinations: destinations.map(toSwapFlowDestination),
    note,
    feeRate,
    omitChangeOutput,
    spendingType: 4,
  });

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
  Scheme?: TokenScheme;
  note?: Bytes[];
  feeRate?: number;
  omitChangeOutput?: boolean;
};

export const BuildStas3TransferTx = ({
  stasPayment,
  feePayment,
  destination,
  Scheme,
  note,
  feeRate,
  omitChangeOutput,
}: TBuildStas3TransferTxRequest) =>
  BuildStas3BaseTx({
    stasPayments: [stasPayment],
    feePayment,
    destinations: [destination],
    Scheme,
    note,
    feeRate,
    omitChangeOutput,
  });

export type TBuildStas3SplitTxRequest = {
  stasPayment: TStas3Payment;
  feePayment: TPayment;
  destinations: TStas3Destination[];
  Scheme?: TokenScheme;
  note?: Bytes[];
  feeRate?: number;
};

export const BuildStas3SplitTx = ({
  stasPayment,
  feePayment,
  destinations,
  Scheme,
  note,
  feeRate,
}: TBuildStas3SplitTxRequest) =>
  BuildStas3BaseTx({
    stasPayments: [stasPayment],
    feePayment,
    destinations,
    Scheme,
    note,
    feeRate,
  });

export type TBuildStas3MergeTxRequest = {
  stasPayments: TStas3Payment[];
  feePayment: TPayment;
  destinations: TStas3Destination[];
  Scheme?: TokenScheme;
  note?: Bytes[];
  feeRate?: number;
};

export const BuildStas3MergeTx = ({
  stasPayments,
  feePayment,
  destinations,
  Scheme,
  note,
  feeRate,
}: TBuildStas3MergeTxRequest) =>
  BuildStas3BaseTx({
    stasPayments,
    feePayment,
    destinations,
    Scheme,
    note,
    feeRate,
  });
