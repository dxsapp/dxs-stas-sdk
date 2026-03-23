import {
  BuildDstasFreezeTx,
  BuildDstasIssueTxs,
  BuildDstasMergeTx,
  BuildDstasSplitTx,
  BuildDstasTransferTx,
  BuildDstasUnfreezeTx,
} from "../../src/dstas-factory";
import { TransactionReader } from "../../src/transaction/read/transaction-reader";
import { OutPoint, ScriptType } from "../../src/bitcoin";
import {
  TDestinationSpec,
  TMasterActor,
  TMasterActorId,
  TMasterAssetId,
  TMasterWorld,
  TTrackedOutput,
  outPointKey,
} from "./dstas-master-types";
import {
  assertLifecycleTxValid,
  expectLifecycleTxFailure,
  recordCheckpoint,
} from "./dstas-master-assert";

const requireActor = (
  world: TMasterWorld,
  actorId: TMasterActorId,
): TMasterActor => {
  const actor = world.actors[actorId];
  if (!actor) throw new Error(`Unknown actor ${actorId}`);
  return actor;
};

const requireSingleWallet = (world: TMasterWorld, actorId: TMasterActorId) => {
  const actor = requireActor(world, actorId);
  if (actor.kind !== "single") {
    throw new Error(
      `Actor ${actorId} is multisig and cannot use high-level owner path in Wave R1`,
    );
  }
  return actor.wallet;
};

const issuerForAsset = (assetId: TMasterAssetId): TMasterActorId =>
  assetId === "assetA" ? "issuerA" : assetId === "assetB" ? "issuerB" : "issuerC";

const freezeAuthorityForAsset = (
  assetId: TMasterAssetId,
): TMasterActorId => (assetId === "assetC" ? "msFreezeAuth" : "freezeAuth");

const findFeeOutput = (
  txHex: string,
  owner: TMasterActorId,
  assetId: TMasterAssetId,
): TTrackedOutput => {
  const tx = TransactionReader.readHex(txHex);
  const feeIndex = tx.Outputs.findIndex(
    (output) => output.ScriptType === ScriptType.p2pkh,
  );
  if (feeIndex < 0) {
    throw new Error(`Expected fee output in ${assetId} transaction`);
  }
  const outPoint = new OutPoint(
    tx.Id,
    feeIndex,
    tx.Outputs[feeIndex].LockingScript,
    tx.Outputs[feeIndex].Satoshis,
    tx.Outputs[feeIndex].Address,
    ScriptType.p2pkh,
  );
  outPoint.Transaction = tx;

  return {
    assetId,
    owner,
    outPoint,
    satoshis: tx.Outputs[feeIndex].Satoshis,
    scriptType: ScriptType.p2pkh,
    isFee: true,
    frozen: false,
  };
};

const dstasDestinationForActor = (
  world: TMasterWorld,
  destination: TDestinationSpec,
) => {
  const actor = requireActor(world, destination.owner);
  if (actor.kind === "single") {
    return {
      Satoshis: destination.satoshis,
      To: actor.address,
      Frozen: destination.frozen,
    };
  }

  return {
    Satoshis: destination.satoshis,
    Frozen: destination.frozen,
    ToOwnerMultisig: {
      m: actor.m,
      publicKeys: actor.publicKeysHex,
    },
  };
};

const addHistory = (
  world: TMasterWorld,
  step: string,
  assetId: TMasterAssetId | undefined,
  txHex: string,
) => {
  const tx = TransactionReader.readHex(txHex);
  world.txMap.set(tx.Id, tx);
  world.history.push({ step, assetId, txHex, tx });
  return tx;
};

const removeLiveOutput = (world: TMasterWorld, tracked: TTrackedOutput) => {
  world.liveOutputs.delete(
    outPointKey(tracked.outPoint.TxId, tracked.outPoint.Vout),
  );
  if (
    world.feeOutputs[tracked.assetId]?.outPoint.toString() ===
    tracked.outPoint.toString()
  ) {
    delete world.feeOutputs[tracked.assetId];
  }
};

const addLiveOutput = (world: TMasterWorld, tracked: TTrackedOutput) => {
  world.liveOutputs.set(
    outPointKey(tracked.outPoint.TxId, tracked.outPoint.Vout),
    tracked,
  );
  if (tracked.isFee) {
    world.feeOutputs[tracked.assetId] = tracked;
  }
};

const addDstasOutputs = (
  world: TMasterWorld,
  assetId: TMasterAssetId,
  txHex: string,
  destinations: TDestinationSpec[],
) => {
  const tx = TransactionReader.readHex(txHex);
  destinations.forEach((destination, index) => {
    const output = tx.Outputs[index];
    if (!output) {
      throw new Error(`Missing DSTAS output ${index} for ${assetId}`);
    }
    const actor = requireActor(world, destination.owner);
    const outPoint = new OutPoint(
      tx.Id,
      index,
      output.LockingScript,
      output.Satoshis,
      output.Address ?? actor.address,
      ScriptType.dstas,
    );
    outPoint.Transaction = tx;

    addLiveOutput(world, {
      assetId,
      owner: destination.owner,
      outPoint,
      satoshis: output.Satoshis,
      scriptType: ScriptType.dstas,
      isFee: false,
      frozen: destination.frozen ?? false,
    });
  });
};

const requireLiveOutput = (
  world: TMasterWorld,
  assetId: TMasterAssetId,
  owner: TMasterActorId,
  satoshis: number,
  options?: { frozen?: boolean },
) => {
  const tracked = [...world.liveOutputs.values()].find(
    (entry) =>
      entry.assetId === assetId &&
      !entry.isFee &&
      entry.owner === owner &&
      entry.satoshis === satoshis &&
      (options?.frozen === undefined || entry.frozen === options.frozen),
  );
  if (!tracked) {
    throw new Error(
      `Missing live ${assetId} output for ${owner} with ${satoshis} sats`,
    );
  }
  return tracked;
};

const requireFeeOutput = (world: TMasterWorld, assetId: TMasterAssetId) => {
  const tracked = world.feeOutputs[assetId];
  if (!tracked) throw new Error(`Missing fee output for ${assetId}`);
  return tracked;
};

export const issue = (
  world: TMasterWorld,
  params: {
    assetId: TMasterAssetId;
    to: TMasterActorId;
    satoshis: number;
    step: string;
  },
) => {
  const funding = world.syntheticFunding[params.assetId];
  const scheme = world.schemes[params.assetId];
  const txs = BuildDstasIssueTxs({
    fundingPayment: {
      OutPoint: funding.outPoint,
      Owner: funding.owner,
    },
    scheme,
    destinations: [
      dstasDestinationForActor(world, {
        owner: params.to,
        satoshis: params.satoshis,
      }),
    ],
  });

  assertLifecycleTxValid(
    world,
    `${params.step}:contract`,
    txs.contractTxHex,
    1,
  );
  addHistory(
    world,
    `${params.step}:contract`,
    params.assetId,
    txs.contractTxHex,
  );

  assertLifecycleTxValid(world, `${params.step}:issue`, txs.issueTxHex, 2);
  addHistory(world, `${params.step}:issue`, params.assetId, txs.issueTxHex);

  addDstasOutputs(world, params.assetId, txs.issueTxHex, [
    { owner: params.to, satoshis: params.satoshis },
  ]);
  addLiveOutput(
    world,
    findFeeOutput(
      txs.issueTxHex,
      issuerForAsset(params.assetId),
      params.assetId,
    ),
  );

  return txs;
};

export const transfer = (
  world: TMasterWorld,
  params: {
    assetId: TMasterAssetId;
    from: TMasterActorId;
    to: TMasterActorId;
    satoshis: number;
    step: string;
  },
) => {
  const stasOutput = requireLiveOutput(
    world,
    params.assetId,
    params.from,
    params.satoshis,
    { frozen: false },
  );
  const feeOutput = requireFeeOutput(world, params.assetId);
  const txHex = BuildDstasTransferTx({
    stasPayment: {
      OutPoint: stasOutput.outPoint,
      Owner: requireSingleWallet(world, params.from),
    },
    feePayment: {
      OutPoint: feeOutput.outPoint,
      Owner: requireSingleWallet(world, feeOutput.owner),
    },
    scheme: world.schemes[params.assetId],
    destination: dstasDestinationForActor(world, {
      owner: params.to,
      satoshis: params.satoshis,
    }),
  });

  assertLifecycleTxValid(world, params.step, txHex, 2);
  addHistory(world, params.step, params.assetId, txHex);

  removeLiveOutput(world, stasOutput);
  removeLiveOutput(world, feeOutput);
  addDstasOutputs(world, params.assetId, txHex, [
    { owner: params.to, satoshis: params.satoshis, frozen: false },
  ]);
  addLiveOutput(world, findFeeOutput(txHex, feeOutput.owner, params.assetId));

  return txHex;
};

export const split = (
  world: TMasterWorld,
  params: {
    assetId: TMasterAssetId;
    from: TMasterActorId;
    satoshis: number;
    outputs: TDestinationSpec[];
    step: string;
  },
) => {
  const stasOutput = requireLiveOutput(
    world,
    params.assetId,
    params.from,
    params.satoshis,
    { frozen: false },
  );
  const feeOutput = requireFeeOutput(world, params.assetId);
  const txHex = BuildDstasSplitTx({
    stasPayment: {
      OutPoint: stasOutput.outPoint,
      Owner: requireSingleWallet(world, params.from),
    },
    feePayment: {
      OutPoint: feeOutput.outPoint,
      Owner: requireSingleWallet(world, feeOutput.owner),
    },
    scheme: world.schemes[params.assetId],
    destinations: params.outputs.map((output) =>
      dstasDestinationForActor(world, output),
    ),
  });

  assertLifecycleTxValid(world, params.step, txHex, 2);
  addHistory(world, params.step, params.assetId, txHex);

  removeLiveOutput(world, stasOutput);
  removeLiveOutput(world, feeOutput);
  addDstasOutputs(world, params.assetId, txHex, params.outputs);
  addLiveOutput(world, findFeeOutput(txHex, feeOutput.owner, params.assetId));

  return txHex;
};

export const merge = (
  world: TMasterWorld,
  params: {
    assetId: TMasterAssetId;
    from: TMasterActorId;
    left: number;
    right: number;
    to: TMasterActorId;
    step: string;
  },
) => {
  const leftOutput = requireLiveOutput(
    world,
    params.assetId,
    params.from,
    params.left,
    { frozen: false },
  );
  const rightOutput = requireLiveOutput(
    world,
    params.assetId,
    params.from,
    params.right,
    { frozen: false },
  );
  if (leftOutput.outPoint.toString() === rightOutput.outPoint.toString()) {
    throw new Error(
      `Merge inputs resolved to the same outpoint for ${params.step}`,
    );
  }
  const feeOutput = requireFeeOutput(world, params.assetId);
  const mergedSatoshis = params.left + params.right;
  const txHex = BuildDstasMergeTx({
    stasPayments: [
      {
        OutPoint: leftOutput.outPoint,
        Owner: requireSingleWallet(world, params.from),
      },
      {
        OutPoint: rightOutput.outPoint,
        Owner: requireSingleWallet(world, params.from),
      },
    ],
    feePayment: {
      OutPoint: feeOutput.outPoint,
      Owner: requireSingleWallet(world, feeOutput.owner),
    },
    scheme: world.schemes[params.assetId],
    destinations: [
      dstasDestinationForActor(world, {
        owner: params.to,
        satoshis: mergedSatoshis,
      }),
    ],
  });

  assertLifecycleTxValid(world, params.step, txHex, 3);
  addHistory(world, params.step, params.assetId, txHex);

  removeLiveOutput(world, leftOutput);
  removeLiveOutput(world, rightOutput);
  removeLiveOutput(world, feeOutput);
  addDstasOutputs(world, params.assetId, txHex, [
    { owner: params.to, satoshis: mergedSatoshis, frozen: false },
  ]);
  addLiveOutput(world, findFeeOutput(txHex, feeOutput.owner, params.assetId));

  return txHex;
};

const buildTransferTx = (
  world: TMasterWorld,
  params: {
    assetId: TMasterAssetId;
    from: TMasterActorId;
    to: TMasterActorId;
    satoshis: number;
    frozen?: boolean;
  },
) => {
  const stasOutput = requireLiveOutput(
    world,
    params.assetId,
    params.from,
    params.satoshis,
    params.frozen === undefined ? undefined : { frozen: params.frozen },
  );
  const feeOutput = requireFeeOutput(world, params.assetId);
  return BuildDstasTransferTx({
    stasPayment: {
      OutPoint: stasOutput.outPoint,
      Owner: requireSingleWallet(world, params.from),
    },
    feePayment: {
      OutPoint: feeOutput.outPoint,
      Owner: requireSingleWallet(world, feeOutput.owner),
    },
    scheme: world.schemes[params.assetId],
    destination: dstasDestinationForActor(world, {
      owner: params.to,
      satoshis: params.satoshis,
      frozen: false,
    }),
  });
};

export const checkpoint = (world: TMasterWorld, name: string) => {
  recordCheckpoint(world, name);
};

export const expectFail = (world: TMasterWorld, buildTx: () => string) => {
  const before = [...world.liveOutputs.keys()].sort();
  const txHex = buildTx();
  const result = expectLifecycleTxFailure(world, txHex);
  expect([...world.liveOutputs.keys()].sort()).toEqual(before);
  return result;
};

export const expectTransferFail = (
  world: TMasterWorld,
  params: {
    assetId: TMasterAssetId;
    from: TMasterActorId;
    to: TMasterActorId;
    satoshis: number;
    frozen?: boolean;
  },
) => expectFail(world, () => buildTransferTx(world, params));

export const freeze = (
  world: TMasterWorld,
  params: {
    assetId: TMasterAssetId;
    targetOwner: TMasterActorId;
    satoshis: number;
    step: string;
  },
) => {
  const stasOutput = requireLiveOutput(
    world,
    params.assetId,
    params.targetOwner,
    params.satoshis,
    { frozen: false },
  );
  const feeOutput = requireFeeOutput(world, params.assetId);
  const authority = freezeAuthorityForAsset(params.assetId);
  const txHex = BuildDstasFreezeTx({
    stasPayments: [
      {
        OutPoint: stasOutput.outPoint,
        Owner: requireSingleWallet(world, authority),
      },
    ],
    feePayment: {
      OutPoint: feeOutput.outPoint,
      Owner: requireSingleWallet(world, feeOutput.owner),
    },
    scheme: world.schemes[params.assetId],
    destinations: [
      dstasDestinationForActor(world, {
        owner: params.targetOwner,
        satoshis: params.satoshis,
        frozen: true,
      }),
    ],
  });

  assertLifecycleTxValid(world, params.step, txHex, 2);
  addHistory(world, params.step, params.assetId, txHex);

  removeLiveOutput(world, stasOutput);
  removeLiveOutput(world, feeOutput);
  addDstasOutputs(world, params.assetId, txHex, [
    { owner: params.targetOwner, satoshis: params.satoshis, frozen: true },
  ]);
  addLiveOutput(world, findFeeOutput(txHex, feeOutput.owner, params.assetId));

  return txHex;
};

export const unfreeze = (
  world: TMasterWorld,
  params: {
    assetId: TMasterAssetId;
    targetOwner: TMasterActorId;
    satoshis: number;
    step: string;
  },
) => {
  const stasOutput = requireLiveOutput(
    world,
    params.assetId,
    params.targetOwner,
    params.satoshis,
    { frozen: true },
  );
  const feeOutput = requireFeeOutput(world, params.assetId);
  const authority = freezeAuthorityForAsset(params.assetId);
  const txHex = BuildDstasUnfreezeTx({
    stasPayments: [
      {
        OutPoint: stasOutput.outPoint,
        Owner: requireSingleWallet(world, authority),
      },
    ],
    feePayment: {
      OutPoint: feeOutput.outPoint,
      Owner: requireSingleWallet(world, feeOutput.owner),
    },
    scheme: world.schemes[params.assetId],
    destinations: [
      dstasDestinationForActor(world, {
        owner: params.targetOwner,
        satoshis: params.satoshis,
        frozen: false,
      }),
    ],
  });

  assertLifecycleTxValid(world, params.step, txHex, 2);
  addHistory(world, params.step, params.assetId, txHex);

  removeLiveOutput(world, stasOutput);
  removeLiveOutput(world, feeOutput);
  addDstasOutputs(world, params.assetId, txHex, [
    { owner: params.targetOwner, satoshis: params.satoshis, frozen: false },
  ]);
  addLiveOutput(world, findFeeOutput(txHex, feeOutput.owner, params.assetId));

  return txHex;
};

export const confiscate = () => {
  throw new Error("Wave R1: confiscate is not implemented yet");
};

export const swap = () => {
  throw new Error("Wave R1: swap is not implemented yet");
};

export const redeem = () => {
  throw new Error("Wave R1: redeem is not implemented yet");
};
