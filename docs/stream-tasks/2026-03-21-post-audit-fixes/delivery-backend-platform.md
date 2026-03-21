# Stream Task - Delivery Backend Platform

- Stream: `delivery`
- Lane: `backend`
- Backend substream: `BE-Platform`
- Zone: `Z2 - Transaction Assembly & Planning`
- Status: `done`
- Depends on: `delivery-backend-contracts done`

## Goal

Fix planner correctness around DSTAS intermediate ownership and tighten the canonical assembly path.

## In scope

- `/Users/imighty/Code/dxs-stas-sdk/src/dstas-bundle-factory.ts`
- `/Users/imighty/Code/dxs-stas-sdk/src/dstas-factory.ts`
- `/Users/imighty/Code/dxs-stas-sdk/src/dstas-tx-assembly.ts`
- `/Users/imighty/Code/dxs-stas-sdk/src/transaction/**`
- Relevant DSTAS planner tests

## Tasks

1. Remove fabricated `Address` fallbacks for intermediate DSTAS outputs; preserve real owner semantics through planning.
2. Reduce alternate issuance assembly drift by moving issuance onto a canonical DSTAS assembly seam or clearly shared internal seam.
3. Improve fee estimation/planner resilience for large or signer-heavy bundles.
4. Remove the most obvious quadratic recipient-queue hotspot.
5. Add/adjust targeted tests for the above.

## Acceptance criteria

- Intermediate DSTAS planning no longer relies on synthetic addresses when outputs do not expose one.
- Issuance is no longer a materially separate assembly path.
- Planner is measurably less brittle for larger bundles.
- Targeted tests pass.

## Validation

```bash
npm run build -- --pretty false
npm test -- --runInBand tests/dstas-bundle-factory.test.ts tests/dstas-flow.test.ts tests/dstas-state-flows.test.ts tests/dstas-swap-flows.test.ts tests/dstas-multisig-authority-flow.test.ts tests/transaction-build.test.ts
```

## Commit expectation

- Commit message suggestion: `fix(platform): preserve dstas owner semantics in planner`
