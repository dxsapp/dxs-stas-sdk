import { expect } from "@jest/globals";
import { evaluateTransactionHex } from "../../src/script";
import { createPrevOutputResolverFromTransactions } from "../../src/script/eval/script-evaluator";
import { FeeRate } from "../../src/transaction-factory";
import { assertFeeInRange, TPrevOutputResolver } from "./fee-assertions";
import {
  TCheckpointExpectation,
  TCheckpointSummary,
  TMasterActorId,
  TMasterAssetId,
  TMasterWorld,
  outPointKey,
} from "./dstas-master-types";

const listSyntheticPrevouts = (world: TMasterWorld) => {
  const entries = new Map<string, { lockingScript: Uint8Array; satoshis: number }>();
  for (const funding of Object.values(world.syntheticFunding)) {
    entries.set(outPointKey(funding.outPoint.TxId, funding.outPoint.Vout), {
      lockingScript: funding.outPoint.LockingScript,
      satoshis: funding.outPoint.Satoshis,
    });
  }
  return entries;
};

export const buildWorldPrevOutputResolver = (
  world: TMasterWorld,
): TPrevOutputResolver => {
  const txResolver = createPrevOutputResolverFromTransactions(world.txMap);
  const synthetic = listSyntheticPrevouts(world);
  return (txId: string, vout: number) => {
    const known = synthetic.get(outPointKey(txId, vout));
    if (known) return known;
    return txResolver(txId, vout);
  };
};

export const assertLifecycleTxValid = (
  world: TMasterWorld,
  step: string,
  txHex: string,
  maxSignatureCountForDerVariance: number,
) => {
  const resolver = buildWorldPrevOutputResolver(world);
  const evalResult = evaluateTransactionHex(txHex, resolver, {
    allowOpReturn: true,
  });

  expect(evalResult.success).toBe(true);
  for (const input of evalResult.inputs) {
    expect(input.success).toBe(true);
  }

  assertFeeInRange(txHex, resolver, FeeRate, maxSignatureCountForDerVariance);
  return evalResult;
};

export const expectLifecycleTxFailure = (
  world: TMasterWorld,
  txHex: string,
) => {
  const evalResult = evaluateTransactionHex(txHex, buildWorldPrevOutputResolver(world), {
    allowOpReturn: true,
  });
  expect(evalResult.success).toBe(false);
  return evalResult;
};

const buildCheckpointSummary = (world: TMasterWorld): TCheckpointSummary => {
  const assets: TMasterAssetId[] = ["assetA", "assetB", "assetC"];
  const ownersByAsset = Object.fromEntries(
    assets.map((assetId) => [assetId, {}]),
  ) as Record<TMasterAssetId, Partial<Record<TMasterActorId, number[]>>>;

  const supplyByAsset = {
    assetA: 0,
    assetB: 0,
    assetC: 0,
  } as Record<TMasterAssetId, number>;

  for (const tracked of world.liveOutputs.values()) {
    if (tracked.isFee) continue;
    supplyByAsset[tracked.assetId] += tracked.satoshis;
    const ownerMap = ownersByAsset[tracked.assetId];
    const current = ownerMap[tracked.owner] ?? [];
    ownerMap[tracked.owner] = [...current, tracked.satoshis].sort((a, b) => a - b);
  }

  return { supplyByAsset, ownersByAsset };
};

export const recordCheckpoint = (world: TMasterWorld, name: string) => {
  world.checkpoints.set(name, buildCheckpointSummary(world));
};

const normalizeOwnerMap = (
  value: Partial<Record<TMasterActorId, number[]>>,
): Partial<Record<TMasterActorId, number[]>> =>
  Object.fromEntries(
    Object.entries(value).map(([owner, amounts]) => [owner, [...(amounts ?? [])].sort((a, b) => a - b)]),
  );

export const assertCheckpoint = (
  world: TMasterWorld,
  name: string,
  expected: TCheckpointExpectation,
) => {
  const checkpoint = world.checkpoints.get(name);
  expect(checkpoint).toBeDefined();
  const actual = checkpoint as TCheckpointSummary;

  for (const [assetId, total] of Object.entries(expected.supplyByAsset)) {
    expect(actual.supplyByAsset[assetId as TMasterAssetId]).toBe(total);
  }

  for (const [assetId, owners] of Object.entries(expected.ownersByAsset)) {
    expect(normalizeOwnerMap(actual.ownersByAsset[assetId as TMasterAssetId])).toMatchObject(
      normalizeOwnerMap(owners ?? {}),
    );
  }
};
