import {
  assertCheckpoint,
  assertTrackedOutputState,
} from "./helpers/dstas-master-assert";
import { createMasterWorld } from "./helpers/dstas-master-fixture";
import {
  checkpoint,
  confiscate,
  createSwapActionDataForDesiredOutput,
  createSwapActionDataForRequest,
  expectTransferFail,
  expectTransferSwapFailWrongRequestedScript,
  freeze,
  issue,
  merge,
  redeem,
  split,
  swapSwap,
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

  test("canonical master lifecycle chains dense issue-to-redeem phases", () => {
    const world = createMasterWorld();

    issue(world, {
      assetId: "assetB",
      to: "ownerB",
      satoshis: 100,
      step: "01 issue assetB",
    });
    issue(world, {
      assetId: "assetC",
      to: "ownerC",
      satoshis: 100,
      step: "02 issue assetC",
    });
    issue(world, {
      assetId: "assetA",
      to: "ownerA",
      satoshis: 100,
      step: "03 issue assetA",
    });

    transfer(world, {
      assetId: "assetA",
      from: "ownerA",
      to: "ownerD",
      satoshis: 100,
      step: "04 assetA transfer ownerA -> ownerD",
    });
    transfer(world, {
      assetId: "assetA",
      from: "ownerD",
      to: "ownerA",
      satoshis: 100,
      step: "05 assetA transfer ownerD -> ownerA",
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
      step: "06 assetA split",
    });
    merge(world, {
      assetId: "assetA",
      from: "ownerA",
      left: 40,
      right: 10,
      to: "ownerA",
      step: "07 assetA merge ownerA fragments",
    });

    transfer(world, {
      assetId: "assetB",
      from: "ownerB",
      to: "ownerE",
      satoshis: 100,
      step: "08 assetB transfer ownerB -> ownerE",
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
      step: "09 assetB split",
    });

    transfer(world, {
      assetId: "assetC",
      from: "ownerC",
      to: "msOwner",
      satoshis: 100,
      step: "10 assetC transfer ownerC -> msOwner",
    });

    checkpoint(world, "master-post-r1");
    assertCheckpoint(world, "master-post-r1", {
      supplyByAsset: {
        assetA: 100,
        assetB: 100,
        assetC: 100,
      },
      ownersByAsset: {
        assetA: {
          ownerA: [50],
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

    freeze(world, {
      assetId: "assetA",
      targetOwner: "ownerA",
      satoshis: 50,
      step: "11 assetA freeze ownerA merged output",
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
      step: "13 assetA unfreeze ownerA merged output",
    });
    transfer(world, {
      assetId: "assetA",
      from: "ownerA",
      to: "ownerE",
      satoshis: 50,
      step: "14 assetA transfer unfrozen merged output to ownerE",
    });
    confiscate(world, {
      assetId: "assetA",
      fromOwner: "ownerE",
      toOwner: "issuerA",
      satoshis: 50,
      step: "15 assetA confiscate ownerE output to issuerA",
    });

    freeze(world, {
      assetId: "assetC",
      targetOwner: "msOwner",
      satoshis: 100,
      step: "16 assetC freeze msOwner output",
    });
    unfreeze(world, {
      assetId: "assetC",
      targetOwner: "msOwner",
      satoshis: 100,
      step: "17 assetC unfreeze msOwner output",
    });

    checkpoint(world, "master-post-authority");
    assertCheckpoint(world, "master-post-authority", {
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

    const invalidSwapAction = createSwapActionDataForRequest(world, {
      requestedAssetId: "assetB",
      requestedOwner: "ownerE",
      requestedSatoshis: 50,
      requestedPkhOwner: "ownerC",
      rateNumerator: 1,
      rateDenominator: 1,
      requestedScriptHashOverride: new Uint8Array(32).fill(0x77),
    });
    issue(world, {
      assetId: "assetC",
      to: "ownerC",
      satoshis: 60,
      actionData: invalidSwapAction,
      step: "18 issue assetC invalid swap request",
    });
    expectTransferSwapFailWrongRequestedScript(world, {
      offeredAssetId: "assetC",
      offeredOwner: "ownerC",
      offeredSatoshis: 60,
      counterpartyAssetId: "assetB",
      counterpartyOwner: "ownerE",
      counterpartySatoshis: 50,
      feeAssetId: "assetC",
      requesterReceives: "ownerC",
      counterpartyReceives: "ownerE",
    });

    const validTransferSwapAction = createSwapActionDataForRequest(world, {
      requestedAssetId: "assetB",
      requestedOwner: "ownerE",
      requestedSatoshis: 50,
      requestedPkhOwner: "ownerA",
      rateNumerator: 1,
      rateDenominator: 1,
    });
    issue(world, {
      assetId: "assetA",
      to: "ownerA",
      satoshis: 50,
      actionData: validTransferSwapAction,
      step: "20 issue assetA valid transfer-swap request",
    });
    transferSwap(world, {
      offeredAssetId: "assetA",
      offeredOwner: "ownerA",
      offeredSatoshis: 50,
      counterpartyAssetId: "assetB",
      counterpartyOwner: "ownerE",
      counterpartySatoshis: 50,
      feeAssetId: "assetA",
      requesterReceives: "ownerA",
      counterpartyReceives: "ownerE",
      step: "21 assetA transfer-swap with assetB",
    });

    checkpoint(world, "master-post-transfer-swap");
    assertCheckpoint(world, "master-post-transfer-swap", {
      supplyByAsset: {
        assetA: 150,
        assetB: 100,
        assetC: 160,
      },
      ownersByAsset: {
        assetA: {
          issuerA: [50],
          ownerB: [30],
          ownerC: [20],
          ownerE: [50],
        },
        assetB: {
          ownerA: [50],
          ownerB: [25],
          ownerD: [25],
        },
        assetC: {
          msOwner: [100],
          ownerC: [60],
        },
      },
    });

    transfer(world, {
      assetId: "assetA",
      from: "ownerE",
      to: "issuerA",
      satoshis: 50,
      step: "22 assetA transfer swapped output to issuerA",
    });
    redeem(world, {
      assetId: "assetA",
      owner: "issuerA",
      satoshis: 50,
      step: "23 assetA redeem swapped output",
    });

    transfer(world, {
      assetId: "assetB",
      from: "ownerA",
      to: "ownerB",
      satoshis: 50,
      step: "24 assetB transfer swapped output to ownerB",
    });
    split(world, {
      assetId: "assetB",
      from: "ownerB",
      satoshis: 50,
      outputs: [
        { owner: "ownerB", satoshis: 20 },
        { owner: "ownerD", satoshis: 30 },
      ],
      step: "25 assetB split swapped output",
    });
    const swapSwapActionC = createSwapActionDataForDesiredOutput(world, {
      requestedAssetId: "assetA",
      requestedOwner: "ownerC",
      requestedPkhOwner: "ownerC",
      rateNumerator: 1,
      rateDenominator: 1,
    });
    issue(world, {
      assetId: "assetC",
      to: "ownerC",
      satoshis: 40,
      actionData: swapSwapActionC,
      step: "26 issue assetC valid swap-swap request",
    });
    const swapSwapActionA = createSwapActionDataForDesiredOutput(world, {
      requestedAssetId: "assetC",
      requestedOwner: "ownerA",
      requestedPkhOwner: "ownerA",
      rateNumerator: 1,
      rateDenominator: 1,
    });
    issue(world, {
      assetId: "assetA",
      to: "ownerA",
      satoshis: 40,
      actionData: swapSwapActionA,
      step: "27 issue assetA valid swap-swap request",
    });
    swapSwap(world, {
      leftAssetId: "assetA",
      leftOwner: "ownerA",
      leftSatoshis: 40,
      rightAssetId: "assetC",
      rightOwner: "ownerC",
      rightSatoshis: 40,
      feeAssetId: "assetA",
      leftReceives: "ownerA",
      rightReceives: "ownerC",
      step: "28 assetA and assetC swap-swap",
    });

    checkpoint(world, "master-post-swap-swap");
    assertCheckpoint(world, "master-post-swap-swap", {
      supplyByAsset: {
        assetA: 140,
        assetB: 100,
        assetC: 200,
      },
      ownersByAsset: {
        assetA: {
          issuerA: [50],
          ownerB: [30],
          ownerC: [20, 40],
        },
        assetB: {
          ownerB: [20, 25],
          ownerD: [25, 30],
        },
        assetC: {
          msOwner: [100],
          ownerA: [40],
          ownerC: [60],
        },
      },
    });

    transfer(world, {
      assetId: "assetA",
      from: "ownerC",
      to: "issuerA",
      satoshis: 40,
      step: "29 assetA transfer swap-swap output to issuerA",
    });
    redeem(world, {
      assetId: "assetA",
      owner: "issuerA",
      satoshis: 40,
      step: "30 assetA redeem swap-swap output",
    });
    redeem(world, {
      assetId: "assetA",
      owner: "issuerA",
      satoshis: 50,
      step: "31 assetA redeem confiscated output",
    });

    transfer(world, {
      assetId: "assetB",
      from: "ownerD",
      to: "issuerB",
      satoshis: 30,
      step: "32 assetB transfer thirty to issuerB",
    });
    redeem(world, {
      assetId: "assetB",
      owner: "issuerB",
      satoshis: 30,
      step: "33 assetB redeem thirty",
    });
    transfer(world, {
      assetId: "assetB",
      from: "ownerD",
      to: "issuerB",
      satoshis: 25,
      step: "34 assetB transfer twenty-five to issuerB",
    });
    redeem(world, {
      assetId: "assetB",
      owner: "issuerB",
      satoshis: 25,
      step: "35 assetB redeem twenty-five",
    });
    transfer(world, {
      assetId: "assetB",
      from: "ownerB",
      to: "ownerE",
      satoshis: 20,
      step: "36 assetB transfer twenty to ownerE",
    });
    transfer(world, {
      assetId: "assetB",
      from: "ownerE",
      to: "issuerB",
      satoshis: 20,
      step: "37 assetB transfer ownerE output to issuerB",
    });
    redeem(world, {
      assetId: "assetB",
      owner: "issuerB",
      satoshis: 20,
      step: "38 assetB redeem twenty",
    });
    transfer(world, {
      assetId: "assetB",
      from: "ownerB",
      to: "issuerB",
      satoshis: 25,
      step: "39 assetB transfer final output to issuerB",
    });
    redeem(world, {
      assetId: "assetB",
      owner: "issuerB",
      satoshis: 25,
      step: "40 assetB redeem final output",
    });

    transfer(world, {
      assetId: "assetC",
      from: "ownerA",
      to: "ownerD",
      satoshis: 40,
      step: "41 assetC transfer swap-swap output to ownerD",
    });
    transfer(world, {
      assetId: "assetC",
      from: "ownerD",
      to: "issuerC",
      satoshis: 40,
      step: "42 assetC transfer swap-swap output to issuerC",
    });
    redeem(world, {
      assetId: "assetC",
      owner: "issuerC",
      satoshis: 40,
      step: "43 assetC redeem swap-swap output",
    });

    checkpoint(world, "master-final");
    assertCheckpoint(world, "master-final", {
      supplyByAsset: {
        assetA: 50,
        assetB: 0,
        assetC: 160,
      },
      ownersByAsset: {
        assetA: {
          ownerB: [30],
          ownerC: [20],
        },
        assetB: {},
        assetC: {
          msOwner: [100],
          ownerC: [60],
        },
      },
    });

    expect(world.history.length).toBe(48);
  });
});
