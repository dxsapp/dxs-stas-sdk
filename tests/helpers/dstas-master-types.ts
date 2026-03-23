import {
  Address,
  OutPoint,
  ScriptType,
  TokenScheme,
  Wallet,
} from "../../src/bitcoin";
import { Transaction } from "../../src/bitcoin/transaction";

export type TMasterActorId =
  | "issuerA"
  | "issuerB"
  | "issuerC"
  | "ownerA"
  | "ownerB"
  | "ownerC"
  | "ownerD"
  | "ownerE"
  | "msOwner"
  | "freezeAuth"
  | "confiscationAuth"
  | "msFreezeAuth"
  | "feeWallet";

export type TMasterAssetId = "assetA" | "assetB" | "assetC";

export type TSingleActor = {
  id: TMasterActorId;
  kind: "single";
  wallet: Wallet;
  address: Address;
};

export type TMultisigActor = {
  id: TMasterActorId;
  kind: "multisig";
  m: number;
  wallets: Wallet[];
  publicKeysHex: string[];
  address: Address;
};

export type TMasterActor = TSingleActor | TMultisigActor;

export type TTrackedOutput = {
  assetId: TMasterAssetId;
  owner: TMasterActorId;
  outPoint: OutPoint;
  satoshis: number;
  scriptType: ScriptType;
  isFee: boolean;
};

export type TTxHistoryEntry = {
  step: string;
  assetId?: TMasterAssetId;
  txHex: string;
  tx: Transaction;
};

export type TCheckpointSummary = {
  supplyByAsset: Record<TMasterAssetId, number>;
  ownersByAsset: Record<
    TMasterAssetId,
    Partial<Record<TMasterActorId, number[]>>
  >;
};

export type TSyntheticPrevout = {
  outPoint: OutPoint;
  owner: Wallet;
};

export type TMasterWorld = {
  actors: Record<TMasterActorId, TMasterActor>;
  schemes: Record<TMasterAssetId, TokenScheme>;
  syntheticFunding: Record<TMasterAssetId, TSyntheticPrevout>;
  txMap: Map<string, Transaction>;
  history: TTxHistoryEntry[];
  liveOutputs: Map<string, TTrackedOutput>;
  feeOutputs: Partial<Record<TMasterAssetId, TTrackedOutput>>;
  checkpoints: Map<string, TCheckpointSummary>;
};

export type TDestinationSpec = {
  owner: TMasterActorId;
  satoshis: number;
};

export type TCheckpointExpectation = {
  supplyByAsset: Partial<Record<TMasterAssetId, number>>;
  ownersByAsset: Partial<
    Record<TMasterAssetId, Partial<Record<TMasterActorId, number[]>>>
  >;
};

export const outPointKey = (txId: string, vout: number) => `${txId}:${vout}`;
