# DSTAS Master Lifecycle Flow - Master Task Package

- Package: `2026-03-23-dstas-master-lifecycle-flow`
- Operator stream: `operator`
- Status: `done`
- Repository: `/Users/imighty/Code/dxs-stas-sdk`

## Goal

Add one serious end-to-end DSTAS lifecycle test package that exercises the protocol from issuance to redemption across ownership churn, split/merge, freeze/unfreeze, confiscation, multisig owner, multisig authority, and swap paths.

## Scenario scope

The canonical scenario uses three DSTAS assets and a shared actor set:

- Assets:
  - `assetA` — main regulated DSTAS, freeze + confiscation enabled
  - `assetB` — second DSTAS for transfer<->swap coverage
  - `assetC` — third DSTAS for swap<->swap and multisig branches
- Actors:
  - `issuerA`, `issuerB`, `issuerC`
  - `ownerA`, `ownerB`, `ownerC`, `ownerD`, `ownerE`
  - `msOwner` (`3-of-5`)
  - `freezeAuth`
  - `confiscationAuth`
  - `msFreezeAuth` (`2-of-3`)
  - `feeWallet`

## Master flow outline

1. Issue `assetA` to `ownerA`.
2. Issue `assetB` to `ownerB`.
3. Issue `assetC` to `ownerC`.
4. Transfer `assetA` ownerA -> ownerD.
5. Transfer `assetA` ownerD -> ownerA.
6. Split `assetA` into ownerA/ownerB/ownerC/ownerA.
7. Transfer `assetB` ownerB -> ownerE.
8. Split `assetB` into ownerE/ownerB/ownerD.
9. Transfer `assetC` ownerC -> msOwner.
10. Split `assetC` multisig-owner output.
11. Merge two `assetA` ownerA outputs.
12. Transfer merged `assetA` to msOwner.
13. Merge `assetB` ownerE + ownerD outputs.
14. Transfer merged `assetB` back to ownerB.
15. Transfer residual `assetC` ownerC -> msOwner.
16. Merge multisig `assetC` outputs.
17. Freeze `assetA` ownerB output.
18. Assert frozen owner spend fails.
19. Unfreeze `assetA` ownerB output.
20. Transfer thawed `assetA` to ownerE.
21. Freeze `assetC` multisig-owner output via multisig authority.
22. Assert frozen multisig-owner spend fails.
23. Unfreeze `assetC` via multisig authority.
24. Confiscate `assetA` ownerE output to issuerA target.
25. Assert confiscation by wrong authority fails.
26. Freeze `assetC` again.
27. Confiscate frozen `assetC` to issuerC target.
28. Assert redeem during freeze/confiscation state fails.
29. Transfer `assetB` ownerB -> ownerD.
30. Split `assetB` ownerD output.
31. Split confiscated `assetA` issuer output.
32. Swap `assetA` ownerA output <-> `assetB` ownerB output.
33. Assert swap fails with wrong `counterpartyScript`.
34. Assert swap fails with wrong `piecesCount`.
35. Assert swap fails with reordered `pieces[]`.
36. Split confiscated `assetC` issuer output.
37. Swap `assetB` output <-> `assetC` output.
38. Transfer swapped `assetC` output ownerA -> ownerD.
39. Transfer swapped `assetB` output ownerC -> ownerE.
40. Merge accumulated `assetB` ownerE outputs.
41. Transfer confiscation residue `assetA` issuerA -> ownerD.
42. Split `assetA` ownerD output into ownerD/ownerB/msOwner.
43. Spend `assetA` multisig-owner output back to ownerA.
44. Merge `assetA` ownerD outputs into a consolidated output.
45. Transfer `assetC` ownerD -> ownerE.
46. Transfer `assetC` ownerE -> msOwner.
47. Spend `assetC` multisig-owner output back to issuerC.
48. Redeem issuer-controlled `assetA` output.
49. Assert non-issuer redeem of `assetB` fails.
50. Transfer `assetB` back to issuerB.
51. Redeem `assetB` by issuerB.
52. Redeem `assetC` by issuerC.

## Required runtime checks

At every successful step:

- `evaluateTransactionHex(...)` must succeed.
- explicit prevout resolvers must be used.
- token satoshi conservation must hold for the relevant asset.
- fee must be within lower and upper bounds.
- owner, action-data, requested-script-hash, and flags must be checked when relevant.

At negative steps:

- script evaluation must fail for the intended reason class.
- the world state must remain unchanged after the failed attempt.

## Streams

| Stream                       | Lane    | Backend substream | Status  | Depends on                   | Model     | Reason                                                       |
| ---------------------------- | ------- | ----------------- | ------- | ---------------------------- | --------- | ------------------------------------------------------------ |
| operator                     | -       | -                 | done    | -                            | reasoning | Own sequencing, gates, and closeout                          |
| delivery-backend-reliability | backend | BE-Reliability    | done    | -                            | Codex     | Own test DSL, world model, master scenario, and assertions   |
| delivery-backend-platform    | backend | BE-Platform       | done    | delivery-backend-reliability | Codex     | Patch production/test-support seams exposed by master driver |
| delivery-backend-contracts   | backend | BE-Contracts      | skipped | delivery-backend-reliability | Codex     | Patch protocol helper gaps only if master flow exposes them  |

## Wave order

1. `delivery-backend-reliability` — build the test harness and first executable scenario slice.
2. `delivery-backend-platform` — patch SDK seams only when the reliability stream identifies concrete blockers.
3. `delivery-backend-contracts` — patch protocol helpers only if the scenario exposes semantic gaps.
4. `delivery-backend-reliability` closeout — complete the 52-step flow and all negative branches.
5. operator closeout.

## Global acceptance criteria

- A new deterministic master lifecycle suite exists and passes with script-level verification.
- The scenario uses a world-state driver instead of ad hoc per-step builder boilerplate.
- The suite covers issuance, transfer, split, merge, freeze, unfreeze, confiscation, transfer<->swap, swap<->swap, multisig owner, multisig authority, and redemption.
- Negative scenarios for frozen spend, wrong confiscation authority, non-issuer redeem, and malformed swap payloads are embedded in the lifecycle.
- Checkpoints capture stable post-phase state so failures localize cleanly.
