import {
  assertCheckpoint,
  assertTrackedOutputState,
} from "./helpers/dstas-master-assert";
import { createMasterWorld } from "./helpers/dstas-master-fixture";
import {
  checkpoint,
  confiscate,
  createSwapActionDataForRequest,
  expectTransferFail,
  expectTransferSwapFailWrongRequestedScript,
  freeze,
  issue,
  merge,
  redeem,
  split,
  transfer,
  transferSwap,
  unfreeze,
} from "./helpers/dstas-master-driver";

describe("dstas master lifecycle", () => {
  test("wave r1+r3: issue through confiscation and authority cycle is valid", () => {
    const world = createMasterWorld();

    issue(world, {
      assetId: "assetA",
      to: "ownerA",
      satoshis: 100,
      step: "issue assetA",
    });
    issue(world, {
      assetId: "assetB",
      to: "ownerB",
      satoshis: 100,
      step: "issue assetB",
    });
    issue(world, {
      assetId: "assetC",
      to: "ownerC",
      satoshis: 100,
      step: "issue assetC",
    });

    transfer(world, {
      assetId: "assetA",
      from: "ownerA",
      to: "ownerD",
      satoshis: 100,
      step: "assetA transfer ownerA -> ownerD",
    });
    transfer(world, {
      assetId: "assetA",
      from: "ownerD",
      to: "ownerA",
      satoshis: 100,
      step: "assetA transfer ownerD -> ownerA",
    });
    split(world, {
      assetId: "assetA",
      from: "ownerA",
      satoshis: 100,
      outputs: [
        { owner: "ownerA", satoshis: 40 },
        { owner: "ownerB", satoshis: 30 },
        { owner: "ownerC", satoshis: 20 },
        { owner: "ownerA", satoshis: 10 },
      ],
      step: "assetA split",
    });
    merge(world, {
      assetId: "assetA",
      from: "ownerA",
      left: 40,
      right: 10,
      to: "ownerA",
      step: "assetA merge ownerA fragments",
    });

    transfer(world, {
      assetId: "assetB",
      from: "ownerB",
      to: "ownerE",
      satoshis: 100,
      step: "assetB transfer ownerB -> ownerE",
    });
    split(world, {
      assetId: "assetB",
      from: "ownerE",
      satoshis: 100,
      outputs: [
        { owner: "ownerE", satoshis: 50 },
        { owner: "ownerB", satoshis: 25 },
        { owner: "ownerD", satoshis: 25 },
      ],
      step: "assetB split",
    });

    transfer(world, {
      assetId: "assetC",
      from: "ownerC",
      to: "msOwner",
      satoshis: 100,
      step: "assetC transfer ownerC -> msOwner",
    });

    checkpoint(world, "post-r1");

    assertCheckpoint(world, "post-r1", {
      supplyByAsset: {
        assetA: 100,
        assetB: 100,
        assetC: 100,
      },
      ownersByAsset: {
        assetA: {
          ownerB: [30],
          ownerC: [20],
          ownerA: [50],
        },
        assetB: {
          ownerB: [25],
          ownerD: [25],
          ownerE: [50],
        },
        assetC: {
          msOwner: [100],
        },
      },
    });

    expect(world.history.length).toBe(13);

    freeze(world, {
      assetId: "assetA",
      targetOwner: "ownerA",
      satoshis: 50,
      step: "assetA freeze ownerA merged output",
    });
    assertTrackedOutputState(world, {
      assetId: "assetA",
      owner: "ownerA",
      satoshis: 50,
      frozen: true,
    });

    expectTransferFail(world, {
      assetId: "assetA",
      from: "ownerA",
      to: "ownerD",
      satoshis: 50,
      frozen: true,
    });

    unfreeze(world, {
      assetId: "assetA",
      targetOwner: "ownerA",
      satoshis: 50,
      step: "assetA unfreeze ownerA merged output",
    });
    assertTrackedOutputState(world, {
      assetId: "assetA",
      owner: "ownerA",
      satoshis: 50,
      frozen: false,
    });

    transfer(world, {
      assetId: "assetA",
      from: "ownerA",
      to: "ownerE",
      satoshis: 50,
      step: "assetA transfer unfrozen merged output to ownerE",
    });

    checkpoint(world, "post-freeze-cycle");

    assertCheckpoint(world, "post-freeze-cycle", {
      supplyByAsset: {
        assetA: 100,
        assetB: 100,
        assetC: 100,
      },
      ownersByAsset: {
        assetA: {
          ownerB: [30],
          ownerC: [20],
          ownerE: [50],
        },
        assetB: {
          ownerB: [25],
          ownerD: [25],
          ownerE: [50],
        },
        assetC: {
          msOwner: [100],
        },
      },
    });

    expect(world.history.length).toBe(16);

    confiscate(world, {
      assetId: "assetA",
      fromOwner: "ownerE",
      toOwner: "issuerA",
      satoshis: 50,
      step: "assetA confiscate ownerE output to issuerA",
    });

    freeze(world, {
      assetId: "assetC",
      targetOwner: "msOwner",
      satoshis: 100,
      step: "assetC freeze msOwner output with multisig authority",
    });
    assertTrackedOutputState(world, {
      assetId: "assetC",
      owner: "msOwner",
      satoshis: 100,
      frozen: true,
    });

    unfreeze(world, {
      assetId: "assetC",
      targetOwner: "msOwner",
      satoshis: 100,
      step: "assetC unfreeze msOwner output with multisig authority",
    });
    assertTrackedOutputState(world, {
      assetId: "assetC",
      owner: "msOwner",
      satoshis: 100,
      frozen: false,
    });

    checkpoint(world, "post-confiscation-authority-cycle");

    assertCheckpoint(world, "post-confiscation-authority-cycle", {
      supplyByAsset: {
        assetA: 100,
        assetB: 100,
        assetC: 100,
      },
      ownersByAsset: {
        assetA: {
          issuerA: [50],
          ownerB: [30],
          ownerC: [20],
        },
        assetB: {
          ownerB: [25],
          ownerD: [25],
          ownerE: [50],
        },
        assetC: {
          msOwner: [100],
        },
      },
    });

    expect(world.history.length).toBe(19);
  });

  test("wave r4: swap block reaches partial redeem coverage", () => {
    const world = createMasterWorld();

    issue(world, {
      assetId: "assetB",
      to: "ownerB",
      satoshis: 100,
      step: "issue assetB",
    });
    const invalidSwapAction = createSwapActionDataForRequest(world, {
      requestedAssetId: "assetB",
      requestedOwner: "ownerB",
      requestedSatoshis: 100,
      requestedPkhOwner: "ownerC",
      rateNumerator: 1,
      rateDenominator: 1,
      requestedScriptHashOverride: new Uint8Array(32).fill(0x55),
    });
    issue(world, {
      assetId: "assetC",
      to: "ownerC",
      satoshis: 100,
      actionData: invalidSwapAction,
      step: "issue assetC with invalid swap request",
    });
    expectTransferSwapFailWrongRequestedScript(world, {
      offeredAssetId: "assetC",
      offeredOwner: "ownerC",
      offeredSatoshis: 100,
      counterpartyAssetId: "assetB",
      counterpartyOwner: "ownerB",
      counterpartySatoshis: 100,
      feeAssetId: "assetC",
      requesterReceives: "ownerC",
      counterpartyReceives: "ownerB",
    });

    const validSwapAction = createSwapActionDataForRequest(world, {
      requestedAssetId: "assetB",
      requestedOwner: "ownerB",
      requestedSatoshis: 100,
      requestedPkhOwner: "ownerA",
      rateNumerator: 1,
      rateDenominator: 1,
    });
    issue(world, {
      assetId: "assetA",
      to: "ownerA",
      satoshis: 100,
      actionData: validSwapAction,
      step: "issue assetA with valid swap request",
    });

    transferSwap(world, {
      offeredAssetId: "assetA",
      offeredOwner: "ownerA",
      offeredSatoshis: 100,
      counterpartyAssetId: "assetB",
      counterpartyOwner: "ownerB",
      counterpartySatoshis: 100,
      feeAssetId: "assetA",
      requesterReceives: "ownerA",
      counterpartyReceives: "ownerB",
      step: "assetA transfer-swap with assetB issue output",
    });

    checkpoint(world, "post-swap-cycle");

    assertCheckpoint(world, "post-swap-cycle", {
      supplyByAsset: {
        assetA: 100,
        assetB: 100,
        assetC: 100,
      },
      ownersByAsset: {
        assetA: {
          ownerB: [100],
        },
        assetB: {
          ownerA: [100],
        },
        assetC: {
          ownerC: [100],
        },
      },
    });

    expect(world.history.length).toBe(7);

    transfer(world, {
      assetId: "assetB",
      from: "ownerA",
      to: "issuerB",
      satoshis: 100,
      step: "assetB transfer swapped output to issuerB",
    });
    redeem(world, {
      assetId: "assetB",
      owner: "issuerB",
      satoshis: 100,
      step: "assetB redeem issuer-owned swapped output",
    });

    checkpoint(world, "post-redeem-cycle");

    assertCheckpoint(world, "post-redeem-cycle", {
      supplyByAsset: {
        assetA: 100,
        assetB: 0,
        assetC: 100,
      },
      ownersByAsset: {
        assetA: {
          ownerB: [100],
        },
        assetC: {
          ownerC: [100],
        },
      },
    });

    expect(world.history.length).toBe(9);
  });
});
