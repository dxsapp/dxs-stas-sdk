import {
  BuildDstasFreezeTx,
  BuildDstasConfiscateTx,
  BuildDstasIssueTxs,
  BuildDstasMergeTx,
  BuildDstasSplitTx,
  BuildDstasSwapTx,
  BuildDstasSwapSwapTx,
  BuildDstasTransferSwapTx,
  BuildDstasTransferTx,
  BuildDstasUnfreezeTx,
} from "../../src/dstas-factory";
import { Address, SignatureHashType } from "../../src/bitcoin";
import { TransactionReader } from "../../src/transaction/read/transaction-reader";
import { OutPoint, ScriptType, Wallet } from "../../src/bitcoin";
import { OpCode } from "../../src/bitcoin/op-codes";
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
  buildDstasFlags,
  buildDstasLockingTokens,
} from "../../src/script/build/dstas-locking-builder";
import { ScriptBuilder } from "../../src/script/build/script-builder";
import { TransactionBuilder } from "../../src/transaction/build/transaction-builder";
import { OutputBuilder } from "../../src/transaction/build/output-builder";
import { FeeRate } from "../../src/transaction-factory";
import { fromHex } from "../../src/bytes";
import { hash160, hash256 } from "../../src/hashes";
import { reverseBytes } from "../../src/buffer/buffer-utils";
import { buildMlpkhPreimage, buildRedeemTx } from "./dstas-flow-shared";
import {
  buildSwapActionData,
  computeDstasRequestedScriptHash,
} from "../../src/script";
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
  assetId === "assetA"
    ? "issuerA"
    : assetId === "assetB"
      ? "issuerB"
      : "issuerC";

const freezeAuthorityForAsset = (assetId: TMasterAssetId): TMasterActorId =>
  assetId === "assetC" ? "msFreezeAuth" : "freezeAuth";

const confiscationAuthorityForAsset = (
  assetId: TMasterAssetId,
): TMasterActorId =>
  assetId === "assetC" ? "msFreezeAuth" : "confiscationAuth";

const buildAuthorityServiceField = (
  authority: NonNullable<
    TMasterWorld["schemes"][TMasterAssetId]["FreezeAuthority"]
  >,
) => {
  const pubKeys = authority.publicKeys.map((value) => fromHex(value));
  if (authority.m === 1 && pubKeys.length === 1) {
    return hash160(pubKeys[0]);
  }

  return hash160(buildMlpkhPreimage(authority.m, pubKeys));
};

const buildDstasLockingScript = (
  world: TMasterWorld,
  assetId: TMasterAssetId,
  owner: Address,
  frozen: boolean,
) => {
  const scheme = world.schemes[assetId];
  const serviceFields = [];
  if (scheme.Freeze && scheme.FreezeAuthority) {
    serviceFields.push(buildAuthorityServiceField(scheme.FreezeAuthority));
  }
  if (scheme.Confiscation && scheme.ConfiscationAuthority) {
    serviceFields.push(
      buildAuthorityServiceField(scheme.ConfiscationAuthority),
    );
  }

  const tokens = buildDstasLockingTokens({
    ownerPkh: owner.Hash160,
    actionData: null,
    redemptionPkh: fromHex(scheme.TokenId),
    frozen,
    flags: buildDstasFlags({
      freezable: scheme.Freeze,
      confiscatable: scheme.Confiscation,
    }),
    serviceFields,
    optionalData: [],
  });

  return ScriptBuilder.fromTokens(tokens, ScriptType.dstas);
};

const buildSwapDestinationForActor = (
  world: TMasterWorld,
  params: {
    assetId: TMasterAssetId;
    owner: TMasterActorId;
    satoshis: number;
    actionData?: ReturnType<typeof buildSwapActionData> | null;
  },
) => {
  const scheme = world.schemes[params.assetId];
  const actor = requireActor(world, params.owner);
  const freezeAuthorityServiceField =
    scheme.Freeze && scheme.FreezeAuthority
      ? buildAuthorityServiceField(scheme.FreezeAuthority)
      : undefined;
  const confiscationAuthorityServiceField =
    scheme.Confiscation && scheme.ConfiscationAuthority
      ? buildAuthorityServiceField(scheme.ConfiscationAuthority)
      : undefined;

  return {
    Satoshis: params.satoshis,
    Owner: actor.address.Hash160,
    TokenIdHex: scheme.TokenId,
    Freezable: scheme.Freeze,
    Confiscatable: scheme.Confiscation,
    FreezeAuthorityServiceField: freezeAuthorityServiceField,
    ConfiscationAuthorityServiceField: confiscationAuthorityServiceField,
    ActionData:
      params.actionData === undefined ? null : (params.actionData ?? null),
  };
};

const buildAuthorityUnlockingScript = ({
  txBuilder,
  stasInputIndex,
  spendingType,
  authoritySigners,
  authorityPubKeys,
  authorityThreshold,
}: {
  txBuilder: TransactionBuilder;
  stasInputIndex: number;
  spendingType: number;
  authoritySigners: Wallet[];
  authorityPubKeys: Uint8Array[];
  authorityThreshold: number;
}) => {
  const script = new ScriptBuilder(ScriptType.p2stas);
  let hasNote = false;
  let hasChange = false;

  for (const output of txBuilder.Outputs) {
    if (output.LockingScript.ScriptType === ScriptType.nullData) {
      const payload = output.LockingScript.toBytes().subarray(2);
      script.addData(payload);
      hasNote = true;
      continue;
    }

    const ownerField =
      output.LockingScript.ToAddress?.Hash160 ??
      output.LockingScript._tokens[0]?.Data;
    if (!ownerField) throw new Error("Output is missing owner field");

    script.addNumber(output.Satoshis).addData(ownerField);

    if (output.LockingScript.ScriptType === ScriptType.dstas) {
      const actionDataToken = output.LockingScript._tokens[1];
      if (actionDataToken?.Data) script.addData(actionDataToken.Data);
      else if (actionDataToken) script.addOpCode(actionDataToken.OpCodeNum);
      else throw new Error("DSTAS output missing action-data token");
    }

    if (output.LockingScript.ScriptType === ScriptType.p2pkh) hasChange = true;
  }

  if (!hasChange) {
    script.addOpCode(OpCode.OP_0);
    script.addOpCode(OpCode.OP_0);
  }
  if (!hasNote) script.addOpCode(OpCode.OP_0);

  const fundingInput = txBuilder.Inputs[txBuilder.Inputs.length - 1];
  script
    .addNumber(fundingInput.OutPoint.Vout)
    .addData(reverseBytes(fromHex(fundingInput.OutPoint.TxId)))
    .addOpCode(OpCode.OP_0);

  const preimage = txBuilder.Inputs[stasInputIndex].preimage(
    TransactionBuilder.DefaultSighashType as SignatureHashType,
  );
  const preimageHash = hash256(preimage);

  script.addData(preimage).addNumber(spendingType);
  script.addOpCode(OpCode.OP_0);

  for (const signer of authoritySigners) {
    const der = signer.sign(preimageHash);
    const derWithType = new Uint8Array(der.length + 1);
    derWithType.set(der);
    derWithType[der.length] = TransactionBuilder.DefaultSighashType;
    script.addData(derWithType);
  }

  script.addData(buildMlpkhPreimage(authorityThreshold, authorityPubKeys));
  return script.toBytes();
};

const prepareAuthorityUnlockingSize = ({
  txBuilder,
  stasInputIndex,
  spendingType,
  authoritySignersCount,
  authorityPubKeysCount,
}: {
  txBuilder: TransactionBuilder;
  stasInputIndex: number;
  spendingType: number;
  authoritySignersCount: number;
  authorityPubKeysCount: number;
}) => {
  const stasInput = txBuilder.Inputs[stasInputIndex];
  stasInput.DstasSpendingType = spendingType;
  stasInput.AuthoritySignaturesCount = authoritySignersCount;
  stasInput.AuthorityPubKeysCount = authorityPubKeysCount;
};

const finalizeAuthorityUnlocking = ({
  txBuilder,
  stasInputIndex,
  spendingType,
  authoritySigners,
  authorityPubKeys,
  authorityThreshold,
}: {
  txBuilder: TransactionBuilder;
  stasInputIndex: number;
  spendingType: number;
  authoritySigners: Wallet[];
  authorityPubKeys: Uint8Array[];
  authorityThreshold: number;
}) => {
  const stasInput = txBuilder.Inputs[stasInputIndex];
  stasInput.DstasSpendingType = spendingType;
  stasInput.UnlockingScript = buildAuthorityUnlockingScript({
    txBuilder,
    stasInputIndex,
    spendingType,
    authoritySigners,
    authorityPubKeys,
    authorityThreshold,
  });
};

const buildMultisigAuthorityStateTx = (
  world: TMasterWorld,
  params: {
    assetId: TMasterAssetId;
    targetOwner: TMasterActorId;
    satoshis: number;
    frozen: boolean;
    spendType: number;
  },
) => {
  const stasOutput = requireLiveOutput(
    world,
    params.assetId,
    params.targetOwner,
    params.satoshis,
    { frozen: !params.frozen },
  );
  const feeOutput = requireFeeOutput(world, params.assetId);
  const authority = requireActor(
    world,
    freezeAuthorityForAsset(params.assetId),
  );
  if (authority.kind !== "multisig") {
    throw new Error(`Expected multisig authority for ${params.assetId}`);
  }
  const feeOwner = requireSingleWallet(world, feeOutput.owner);
  const targetOwner = requireActor(world, params.targetOwner);
  const authorityPubKeys = authority.wallets.map((wallet) => wallet.PublicKey);
  const authoritySigners = authority.wallets.slice(0, authority.m);

  const txBuilder = TransactionBuilder.init()
    .addInput(stasOutput.outPoint, authority.wallets[0])
    .addInput(feeOutput.outPoint, feeOwner);
  txBuilder.Outputs.push(
    new OutputBuilder(
      buildDstasLockingScript(
        world,
        params.assetId,
        targetOwner.address,
        params.frozen,
      ),
      stasOutput.satoshis,
    ),
  );

  prepareAuthorityUnlockingSize({
    txBuilder,
    stasInputIndex: 0,
    spendingType: params.spendType,
    authoritySignersCount: authoritySigners.length,
    authorityPubKeysCount: authorityPubKeys.length,
  });
  txBuilder.addChangeOutputWithFee(
    feeOwner.Address,
    feeOutput.satoshis,
    FeeRate,
    1,
  );
  finalizeAuthorityUnlocking({
    txBuilder,
    stasInputIndex: 0,
    spendingType: params.spendType,
    authoritySigners,
    authorityPubKeys,
    authorityThreshold: authority.m,
  });

  return txBuilder.sign().toHex();
};

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

const addTrackedDstasOutput = (
  world: TMasterWorld,
  assetId: TMasterAssetId,
  txHex: string,
  outputIndex: number,
  destination: TDestinationSpec,
) => {
  const tx = TransactionReader.readHex(txHex);
  const output = tx.Outputs[outputIndex];
  if (!output) {
    throw new Error(`Missing DSTAS output ${outputIndex} for ${assetId}`);
  }
  const actor = requireActor(world, destination.owner);
  const outPoint = new OutPoint(
    tx.Id,
    outputIndex,
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
    actionData?: ReturnType<typeof buildSwapActionData> | null;
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
      {
        ...dstasDestinationForActor(world, {
          owner: params.to,
          satoshis: params.satoshis,
        }),
        ...(params.actionData === undefined
          ? {}
          : { ActionData: params.actionData ?? null }),
      },
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

export const createSwapActionDataForRequest = (
  world: TMasterWorld,
  params: {
    requestedAssetId: TMasterAssetId;
    requestedOwner: TMasterActorId;
    requestedSatoshis: number;
    requestedPkhOwner: TMasterActorId;
    rateNumerator: number;
    rateDenominator: number;
    requestedScriptHashOverride?: Uint8Array;
  },
) => {
  const requestedOutput = requireLiveOutput(
    world,
    params.requestedAssetId,
    params.requestedOwner,
    params.requestedSatoshis,
    { frozen: false },
  );
  const requestedPkhActor = requireActor(world, params.requestedPkhOwner);

  return buildSwapActionData({
    requestedScriptHash:
      params.requestedScriptHashOverride ??
      computeDstasRequestedScriptHash(requestedOutput.outPoint.LockingScript),
    requestedPkh: requestedPkhActor.address.Hash160,
    rateNumerator: params.rateNumerator,
    rateDenominator: params.rateDenominator,
  });
};

export const createSwapActionDataForDesiredOutput = (
  world: TMasterWorld,
  params: {
    requestedAssetId: TMasterAssetId;
    requestedOwner: TMasterActorId;
    requestedPkhOwner: TMasterActorId;
    rateNumerator: number;
    rateDenominator: number;
    requestedScriptHashOverride?: Uint8Array;
  },
) => {
  const requestedOwnerActor = requireActor(world, params.requestedOwner);
  const requestedPkhActor = requireActor(world, params.requestedPkhOwner);

  return buildSwapActionData({
    requestedScriptHash:
      params.requestedScriptHashOverride ??
      computeDstasRequestedScriptHash(
        buildDstasLockingScript(
          world,
          params.requestedAssetId,
          requestedOwnerActor.address,
          false,
        ),
      ),
    requestedPkh: requestedPkhActor.address.Hash160,
    rateNumerator: params.rateNumerator,
    rateDenominator: params.rateDenominator,
  });
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

const buildSwapMarkTx = (
  world: TMasterWorld,
  params: {
    assetId: TMasterAssetId;
    owner: TMasterActorId;
    satoshis: number;
    requestedAssetId: TMasterAssetId;
    requestedOwner: TMasterActorId;
    requestedSatoshis: number;
    rateNumerator: number;
    rateDenominator: number;
    requestedScriptHashOverride?: Uint8Array;
  },
) => {
  const stasOutput = requireLiveOutput(
    world,
    params.assetId,
    params.owner,
    params.satoshis,
    { frozen: false },
  );
  const counterpartyOutput = requireLiveOutput(
    world,
    params.requestedAssetId,
    params.requestedOwner,
    params.requestedSatoshis,
    { frozen: false },
  );
  const feeOutput = requireFeeOutput(world, params.assetId);
  const owner = requireActor(world, params.owner);
  const actionData = buildSwapActionData({
    requestedScriptHash:
      params.requestedScriptHashOverride ??
      computeDstasRequestedScriptHash(
        counterpartyOutput.outPoint.LockingScript,
      ),
    requestedPkh: owner.address.Hash160,
    rateNumerator: params.rateNumerator,
    rateDenominator: params.rateDenominator,
  });

  return BuildDstasSwapTx({
    stasPayments: [
      {
        OutPoint: stasOutput.outPoint,
        Owner: requireSingleWallet(world, params.owner),
      },
    ],
    feePayment: {
      OutPoint: feeOutput.outPoint,
      Owner: requireSingleWallet(world, feeOutput.owner),
    },
    scheme: world.schemes[params.assetId],
    destinations: [
      {
        ...dstasDestinationForActor(world, {
          owner: params.owner,
          satoshis: params.satoshis,
          frozen: false,
        }),
        ActionData: actionData,
      },
    ],
  });
};

const buildTransferSwapTx = (
  world: TMasterWorld,
  params: {
    offeredAssetId: TMasterAssetId;
    offeredOwner: TMasterActorId;
    offeredSatoshis: number;
    counterpartyAssetId: TMasterAssetId;
    counterpartyOwner: TMasterActorId;
    counterpartySatoshis: number;
    feeAssetId: TMasterAssetId;
    requesterReceives: TMasterActorId;
    counterpartyReceives: TMasterActorId;
  },
) => {
  const offeredOutput = requireLiveOutput(
    world,
    params.offeredAssetId,
    params.offeredOwner,
    params.offeredSatoshis,
    { frozen: false },
  );
  const counterpartyOutput = requireLiveOutput(
    world,
    params.counterpartyAssetId,
    params.counterpartyOwner,
    params.counterpartySatoshis,
    { frozen: false },
  );
  const feeOutput = requireFeeOutput(world, params.feeAssetId);

  return BuildDstasTransferSwapTx({
    stasPayments: [
      {
        OutPoint: offeredOutput.outPoint,
        Owner: requireSingleWallet(world, params.offeredOwner),
      },
      {
        OutPoint: counterpartyOutput.outPoint,
        Owner: requireSingleWallet(world, params.counterpartyOwner),
      },
    ],
    feePayment: {
      OutPoint: feeOutput.outPoint,
      Owner: requireSingleWallet(world, feeOutput.owner),
    },
    destinations: [
      buildSwapDestinationForActor(world, {
        assetId: params.counterpartyAssetId,
        owner: params.requesterReceives,
        satoshis: params.counterpartySatoshis,
        actionData: null,
      }),
      buildSwapDestinationForActor(world, {
        assetId: params.offeredAssetId,
        owner: params.counterpartyReceives,
        satoshis: params.offeredSatoshis,
        actionData: null,
      }),
    ],
  });
};

const buildSwapSwapTx = (
  world: TMasterWorld,
  params: {
    leftAssetId: TMasterAssetId;
    leftOwner: TMasterActorId;
    leftSatoshis: number;
    rightAssetId: TMasterAssetId;
    rightOwner: TMasterActorId;
    rightSatoshis: number;
    feeAssetId: TMasterAssetId;
    leftReceives: TMasterActorId;
    rightReceives: TMasterActorId;
  },
) => {
  const leftOutput = requireLiveOutput(
    world,
    params.leftAssetId,
    params.leftOwner,
    params.leftSatoshis,
    { frozen: false },
  );
  const rightOutput = requireLiveOutput(
    world,
    params.rightAssetId,
    params.rightOwner,
    params.rightSatoshis,
    { frozen: false },
  );
  const feeOutput = requireFeeOutput(world, params.feeAssetId);

  return BuildDstasSwapSwapTx({
    stasPayments: [
      {
        OutPoint: leftOutput.outPoint,
        Owner: requireSingleWallet(world, params.leftOwner),
      },
      {
        OutPoint: rightOutput.outPoint,
        Owner: requireSingleWallet(world, params.rightOwner),
      },
    ],
    feePayment: {
      OutPoint: feeOutput.outPoint,
      Owner: requireSingleWallet(world, feeOutput.owner),
    },
    destinations: [
      buildSwapDestinationForActor(world, {
        assetId: params.rightAssetId,
        owner: params.leftReceives,
        satoshis: params.rightSatoshis,
        actionData: null,
      }),
      buildSwapDestinationForActor(world, {
        assetId: params.leftAssetId,
        owner: params.rightReceives,
        satoshis: params.leftSatoshis,
        actionData: null,
      }),
    ],
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
  if (requireActor(world, authority).kind === "multisig") {
    const txHex = buildMultisigAuthorityStateTx(world, {
      assetId: params.assetId,
      targetOwner: params.targetOwner,
      satoshis: params.satoshis,
      frozen: true,
      spendType: 2,
    });

    assertLifecycleTxValid(world, params.step, txHex, 3);
    addHistory(world, params.step, params.assetId, txHex);

    removeLiveOutput(world, stasOutput);
    removeLiveOutput(world, feeOutput);
    addDstasOutputs(world, params.assetId, txHex, [
      { owner: params.targetOwner, satoshis: params.satoshis, frozen: true },
    ]);
    addLiveOutput(world, findFeeOutput(txHex, feeOutput.owner, params.assetId));

    return txHex;
  }

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
  if (requireActor(world, authority).kind === "multisig") {
    const txHex = buildMultisigAuthorityStateTx(world, {
      assetId: params.assetId,
      targetOwner: params.targetOwner,
      satoshis: params.satoshis,
      frozen: false,
      spendType: 2,
    });

    assertLifecycleTxValid(world, params.step, txHex, 3);
    addHistory(world, params.step, params.assetId, txHex);

    removeLiveOutput(world, stasOutput);
    removeLiveOutput(world, feeOutput);
    addDstasOutputs(world, params.assetId, txHex, [
      { owner: params.targetOwner, satoshis: params.satoshis, frozen: false },
    ]);
    addLiveOutput(world, findFeeOutput(txHex, feeOutput.owner, params.assetId));

    return txHex;
  }

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

export const confiscate = (
  world: TMasterWorld,
  params: {
    assetId: TMasterAssetId;
    fromOwner: TMasterActorId;
    toOwner: TMasterActorId;
    satoshis: number;
    step: string;
  },
) => {
  const stasOutput = requireLiveOutput(
    world,
    params.assetId,
    params.fromOwner,
    params.satoshis,
  );
  const feeOutput = requireFeeOutput(world, params.assetId);
  const authority = confiscationAuthorityForAsset(params.assetId);
  if (requireActor(world, authority).kind !== "single") {
    throw new Error(
      `Wave R2 confiscation only supports single-key authority for ${params.assetId}`,
    );
  }
  const txHex = BuildDstasConfiscateTx({
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
        owner: params.toOwner,
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
    { owner: params.toOwner, satoshis: params.satoshis, frozen: false },
  ]);
  addLiveOutput(world, findFeeOutput(txHex, feeOutput.owner, params.assetId));

  return txHex;
};

export const markSwapRequest = (
  world: TMasterWorld,
  params: {
    assetId: TMasterAssetId;
    owner: TMasterActorId;
    satoshis: number;
    requestedAssetId: TMasterAssetId;
    requestedOwner: TMasterActorId;
    requestedSatoshis: number;
    rateNumerator: number;
    rateDenominator: number;
    requestedScriptHashOverride?: Uint8Array;
    step: string;
  },
) => {
  const markedStas = requireLiveOutput(
    world,
    params.assetId,
    params.owner,
    params.satoshis,
    { frozen: false },
  );
  const markFeeOutput = requireFeeOutput(world, params.assetId);
  const markTxHex = buildSwapMarkTx(world, params);

  assertLifecycleTxValid(world, params.step, markTxHex, 2);
  addHistory(world, params.step, params.assetId, markTxHex);

  removeLiveOutput(world, markedStas);
  removeLiveOutput(world, markFeeOutput);
  addDstasOutputs(world, params.assetId, markTxHex, [
    { owner: params.owner, satoshis: params.satoshis, frozen: false },
  ]);
  addLiveOutput(
    world,
    findFeeOutput(markTxHex, markFeeOutput.owner, params.assetId),
  );

  return markTxHex;
};

export const expectSwapMarkFailWrongRequestedScript = (
  world: TMasterWorld,
  params: {
    assetId: TMasterAssetId;
    owner: TMasterActorId;
    satoshis: number;
    requestedAssetId: TMasterAssetId;
    requestedOwner: TMasterActorId;
    requestedSatoshis: number;
    rateNumerator: number;
    rateDenominator: number;
    requestedScriptHashOverride: Uint8Array;
  },
) => expectFail(world, () => buildSwapMarkTx(world, params));

export const transferSwap = (
  world: TMasterWorld,
  params: {
    offeredAssetId: TMasterAssetId;
    offeredOwner: TMasterActorId;
    offeredSatoshis: number;
    counterpartyAssetId: TMasterAssetId;
    counterpartyOwner: TMasterActorId;
    counterpartySatoshis: number;
    feeAssetId: TMasterAssetId;
    requesterReceives: TMasterActorId;
    counterpartyReceives: TMasterActorId;
    step: string;
  },
) => {
  const offeredOutput = requireLiveOutput(
    world,
    params.offeredAssetId,
    params.offeredOwner,
    params.offeredSatoshis,
    { frozen: false },
  );
  const counterpartyOutput = requireLiveOutput(
    world,
    params.counterpartyAssetId,
    params.counterpartyOwner,
    params.counterpartySatoshis,
    { frozen: false },
  );
  const feeOutput = requireFeeOutput(world, params.feeAssetId);
  const swapTxHex = buildTransferSwapTx(world, {
    offeredAssetId: params.offeredAssetId,
    offeredOwner: params.offeredOwner,
    offeredSatoshis: params.offeredSatoshis,
    counterpartyAssetId: params.counterpartyAssetId,
    counterpartyOwner: params.counterpartyOwner,
    counterpartySatoshis: params.counterpartySatoshis,
    feeAssetId: params.feeAssetId,
    requesterReceives: params.requesterReceives,
    counterpartyReceives: params.counterpartyReceives,
  });

  assertLifecycleTxValid(world, params.step, swapTxHex, 3);
  addHistory(world, params.step, undefined, swapTxHex);

  removeLiveOutput(world, offeredOutput);
  removeLiveOutput(world, counterpartyOutput);
  removeLiveOutput(world, feeOutput);
  addTrackedDstasOutput(world, params.counterpartyAssetId, swapTxHex, 0, {
    owner: params.requesterReceives,
    satoshis: params.counterpartySatoshis,
    frozen: false,
  });
  addTrackedDstasOutput(world, params.offeredAssetId, swapTxHex, 1, {
    owner: params.counterpartyReceives,
    satoshis: params.offeredSatoshis,
    frozen: false,
  });
  addLiveOutput(
    world,
    findFeeOutput(swapTxHex, feeOutput.owner, params.feeAssetId),
  );

  return swapTxHex;
};

export const swap = (
  world: TMasterWorld,
  params: {
    assetId: TMasterAssetId;
    owner: TMasterActorId;
    satoshis: number;
    requestedAssetId: TMasterAssetId;
    requestedOwner: TMasterActorId;
    requestedSatoshis: number;
    requesterReceives: TMasterActorId;
    counterpartyReceives: TMasterActorId;
    rateNumerator: number;
    rateDenominator: number;
    markStep: string;
    swapStep: string;
  },
) => {
  const markTxHex = markSwapRequest(world, {
    assetId: params.assetId,
    owner: params.owner,
    satoshis: params.satoshis,
    requestedAssetId: params.requestedAssetId,
    requestedOwner: params.requestedOwner,
    requestedSatoshis: params.requestedSatoshis,
    rateNumerator: params.rateNumerator,
    rateDenominator: params.rateDenominator,
    step: params.markStep,
  });
  const swapTxHex = transferSwap(world, {
    offeredAssetId: params.assetId,
    offeredOwner: params.owner,
    offeredSatoshis: params.satoshis,
    counterpartyAssetId: params.requestedAssetId,
    counterpartyOwner: params.requestedOwner,
    counterpartySatoshis: params.requestedSatoshis,
    feeAssetId: params.assetId,
    requesterReceives: params.requesterReceives,
    counterpartyReceives: params.counterpartyReceives,
    step: params.swapStep,
  });

  return { markTxHex, swapTxHex };
};

export const swapSwap = (
  world: TMasterWorld,
  params: {
    leftAssetId: TMasterAssetId;
    leftOwner: TMasterActorId;
    leftSatoshis: number;
    rightAssetId: TMasterAssetId;
    rightOwner: TMasterActorId;
    rightSatoshis: number;
    feeAssetId: TMasterAssetId;
    leftReceives: TMasterActorId;
    rightReceives: TMasterActorId;
    step: string;
  },
) => {
  const leftOutput = requireLiveOutput(
    world,
    params.leftAssetId,
    params.leftOwner,
    params.leftSatoshis,
    { frozen: false },
  );
  const rightOutput = requireLiveOutput(
    world,
    params.rightAssetId,
    params.rightOwner,
    params.rightSatoshis,
    { frozen: false },
  );
  const feeOutput = requireFeeOutput(world, params.feeAssetId);
  const swapTxHex = buildSwapSwapTx(world, params);

  assertLifecycleTxValid(world, params.step, swapTxHex, 3);
  addHistory(world, params.step, undefined, swapTxHex);

  removeLiveOutput(world, leftOutput);
  removeLiveOutput(world, rightOutput);
  removeLiveOutput(world, feeOutput);
  addTrackedDstasOutput(world, params.rightAssetId, swapTxHex, 0, {
    owner: params.leftReceives,
    satoshis: params.rightSatoshis,
    frozen: false,
  });
  addTrackedDstasOutput(world, params.leftAssetId, swapTxHex, 1, {
    owner: params.rightReceives,
    satoshis: params.leftSatoshis,
    frozen: false,
  });
  addLiveOutput(
    world,
    findFeeOutput(swapTxHex, feeOutput.owner, params.feeAssetId),
  );

  return swapTxHex;
};

export const expectTransferSwapFailWrongRequestedScript = (
  world: TMasterWorld,
  params: {
    offeredAssetId: TMasterAssetId;
    offeredOwner: TMasterActorId;
    offeredSatoshis: number;
    counterpartyAssetId: TMasterAssetId;
    counterpartyOwner: TMasterActorId;
    counterpartySatoshis: number;
    feeAssetId: TMasterAssetId;
    requesterReceives: TMasterActorId;
    counterpartyReceives: TMasterActorId;
  },
) => expectFail(world, () => buildTransferSwapTx(world, params));

export const redeem = (
  world: TMasterWorld,
  params: {
    assetId: TMasterAssetId;
    owner: TMasterActorId;
    satoshis: number;
    step: string;
  },
) => {
  const stasOutput = requireLiveOutput(
    world,
    params.assetId,
    params.owner,
    params.satoshis,
    { frozen: false },
  );
  const feeOutput = requireFeeOutput(world, params.assetId);
  const issuer = issuerForAsset(params.assetId);
  const txHex = buildRedeemTx({
    stasOutPoint: stasOutput.outPoint,
    stasOwner: requireSingleWallet(world, params.owner),
    feeOutPoint: feeOutput.outPoint,
    feeOwner: requireSingleWallet(world, feeOutput.owner),
    redeemAddress: requireActor(world, issuer).address,
  });

  assertLifecycleTxValid(world, params.step, txHex, 2);
  addHistory(world, params.step, params.assetId, txHex);

  removeLiveOutput(world, stasOutput);
  removeLiveOutput(world, feeOutput);
  addLiveOutput(world, findFeeOutput(txHex, feeOutput.owner, params.assetId));

  return txHex;
};
