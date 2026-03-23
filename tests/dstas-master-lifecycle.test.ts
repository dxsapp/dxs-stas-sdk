import { assertCheckpoint } from "./helpers/dstas-master-assert";
import { createMasterWorld } from "./helpers/dstas-master-fixture";
import {
  checkpoint,
  issue,
  split,
  transfer,
} from "./helpers/dstas-master-driver";

describe("dstas master lifecycle", () => {
  test("wave r1: issue transfer split checkpoint slice is valid", () => {
    const world = createMasterWorld();

    issue(world, { assetId: "assetA", to: "ownerA", satoshis: 100, step: "issue assetA" });
    issue(world, { assetId: "assetB", to: "ownerB", satoshis: 100, step: "issue assetB" });
    issue(world, { assetId: "assetC", to: "ownerC", satoshis: 100, step: "issue assetC" });

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

    checkpoint(world, "post-initial-slice");

    assertCheckpoint(world, "post-initial-slice", {
      supplyByAsset: {
        assetA: 100,
        assetB: 100,
        assetC: 100,
      },
      ownersByAsset: {
        assetA: {
          ownerB: [30],
          ownerC: [20],
          ownerA: [10, 40],
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

    expect(world.history.length).toBe(12);
  });
});
