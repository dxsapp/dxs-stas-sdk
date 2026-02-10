import {
  Address,
  OutPointFull,
  PrivateKey,
  TDestination,
  TokenScheme,
  TPayment,
  Wallet,
} from "./bitcoin";
import { TransactionBuilder } from "./transaction/build/transaction-builder";
import { Bytes } from "./bytes";

export const FeeRate = 0.1;

export type TBuildTransferTxRequest = {
  tokenScheme: TokenScheme;
  stasPayment: TPayment;
  feePayment: TPayment;
  to: Address;
  note?: Bytes[];
  feeRate: number;
};

export const BuildTransferTx = ({
  tokenScheme,
  stasPayment,
  feePayment,
  to,
  note,
  feeRate,
}: TBuildTransferTxRequest) => {
  const txBuilder = TransactionBuilder.init()
    .addInput(stasPayment.OutPoint, stasPayment.Owner)
    .addInput(feePayment.OutPoint, feePayment.Owner)
    .addStasOutputByScheme(tokenScheme, stasPayment.OutPoint.Satoshis, to);

  const feeOutputIdx = txBuilder.Outputs.length;

  if (note) txBuilder.addNullDataOutput(note!);

  return txBuilder
    .addChangeOutputWithFee(
      feePayment.OutPoint.Address,
      feePayment.OutPoint.Satoshis,
      feeRate,
      feeOutputIdx,
    )
    .sign()
    .toHex();
};

export type TBuildSplitTxRequest = {
  tokenScheme: TokenScheme;
  stasPayment: TPayment;
  feePayment: TPayment;
  destinations: TDestination[];
  note?: Bytes[];
  feeRate: number;
};

export const BuildSplitTx = ({
  tokenScheme,
  stasPayment,
  feePayment,
  destinations,
  note,
  feeRate,
}: TBuildSplitTxRequest) => {
  if (destinations.length === 0 || destinations.length > 4)
    throw new Error(
      "Destinations count must be no less than one and no more than four",
    );

  const outputSatoshis = destinations.reduce((a, x) => a + x.Satoshis, 0);

  if (outputSatoshis !== stasPayment.OutPoint.Satoshis)
    throw new Error("Input satoshis must be equal output satoshis");

  const txBuilder = TransactionBuilder.init()
    .addInput(stasPayment.OutPoint, stasPayment.Owner)
    .addInput(feePayment.OutPoint, feePayment.Owner);

  for (const destination of destinations)
    txBuilder.addStasOutputByScheme(
      tokenScheme,
      destination.Satoshis,
      destination.Address,
    );

  const feeOutputIdx = txBuilder.Outputs.length;

  if (note) txBuilder.addNullDataOutput(note!);

  return txBuilder
    .addChangeOutputWithFee(
      feePayment.OutPoint.Address,
      feePayment.OutPoint.Satoshis,
      feeRate,
      feeOutputIdx,
    )
    .sign()
    .toHex();
};

export type TBuildMergeTxRequest = {
  tokenScheme: TokenScheme;
  outPoint1: OutPointFull;
  outPoint2: OutPointFull;
  owner: PrivateKey | Wallet;
  feePayment: TPayment;
  destination: TDestination;
  splitDestination?: TDestination;
  note?: Bytes[];
  feeRate: number;
};

export const BuildMergeTx = ({
  tokenScheme,
  outPoint1,
  outPoint2,
  owner,
  feePayment,
  destination,
  splitDestination,
  note,
  feeRate,
}: TBuildMergeTxRequest) => {
  if (outPoint1.Address.Value !== outPoint2.Address.Value)
    throw new Error("Both inputs have to belong to same address");

  const outputSatoshis =
    destination.Satoshis + (splitDestination?.Satoshis ?? 0);

  if (outputSatoshis !== outPoint1.Satoshis + outPoint2.Satoshis)
    throw new Error("Input satoshis must be equal output satoshis");

  const txBuilder = TransactionBuilder.init()
    .addStasMergeInput(outPoint1, owner)
    .addStasMergeInput(outPoint2, owner)
    .addInput(feePayment.OutPoint, feePayment.Owner)
    .addStasOutputByScheme(
      tokenScheme,
      destination.Satoshis,
      destination.Address,
    );

  if (splitDestination)
    txBuilder.addStasOutputByScheme(
      tokenScheme,
      splitDestination.Satoshis,
      splitDestination.Address,
    );

  const feeOutputIdx = txBuilder.Outputs.length;

  if (note) txBuilder.addNullDataOutput(note!);

  return txBuilder
    .addChangeOutputWithFee(
      feePayment.OutPoint.Address,
      feePayment.OutPoint.Satoshis,
      feeRate,
      feeOutputIdx,
    )
    .sign()
    .toHex();
};

export type TBuildRedeemTxRequest = {
  tokenScheme: TokenScheme;
  stasPayment: TPayment;
  feePayment: TPayment;
  splitDestinations?: TDestination[];
  note?: Bytes[];
  feeRate: number;
};

export const BuildRedeemTx = ({
  tokenScheme,
  stasPayment,
  feePayment,
  splitDestinations,
  note,
  feeRate,
}: TBuildRedeemTxRequest) => {
  const redeemAddress = Address.fromHash160Hex(tokenScheme.TokenId);

  if (stasPayment.OutPoint.Address.Value !== redeemAddress.Value)
    throw new Error("Only owner of redeem address can redeem STAS tokens");

  if ((splitDestinations?.length ?? 0) > 3)
    throw new Error("Destinations count must be no more than 3");

  const splitAmount =
    splitDestinations?.reduce((a, x) => a + x.Satoshis, 0) ?? 0;
  const redeemAmount = stasPayment.OutPoint.Satoshis - splitAmount;

  if (redeemAmount < 0)
    throw new Error("Input satoshis must be equal output satoshis");

  if (redeemAmount === 0)
    throw new Error("redeemAmount must be at least 1 satoshi");

  const txBuilder = TransactionBuilder.init()
    .addInput(stasPayment.OutPoint, stasPayment.Owner)
    .addInput(feePayment.OutPoint, feePayment.Owner)
    .addP2PkhOutput(redeemAmount, redeemAddress);

  if (splitDestinations)
    for (const splitDestination of splitDestinations)
      txBuilder.addStasOutputByScheme(
        tokenScheme,
        splitDestination.Satoshis,
        splitDestination.Address,
      );

  const feeOutputIdx = txBuilder.Outputs.length;

  if (note) txBuilder.addNullDataOutput(note!);

  return txBuilder
    .addChangeOutputWithFee(
      feePayment.OutPoint.Address,
      feePayment.OutPoint.Satoshis,
      feeRate,
      feeOutputIdx,
    )
    .sign()
    .toHex();
};
