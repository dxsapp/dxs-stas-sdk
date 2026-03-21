# Stream Task - Delivery Backend Platform

- Stream: `delivery`
- Lane: `backend`
- Backend substream: `BE-Platform`
- Zone: `Z2 - Transaction Assembly & Planning`
- Status: `done`
- Depends on: `-`

## Goal

Make DSTAS service planning owner-aware so intermediate outputs do not depend on exposed `Address` fields.

## In scope

- `/Users/imighty/Code/dxs-stas-sdk/src/dstas-bundle-factory.ts`
- If needed for supporting internal types only: `/Users/imighty/Code/dxs-stas-sdk/src/dstas-tx-assembly.ts` or a new nearby internal helper
- Relevant DSTAS planner tests

## Tasks

1. Remove address-centric reconstruction for service/intermediate DSTAS outputs.
2. Carry forward explicit owner semantics through planner/service tx chains.
3. Keep the planner safe for multisig-owner intermediate outputs.
4. Add/adjust targeted tests.

## Acceptance criteria

- Planner no longer relies on synthetic addresses or missing `TransactionOutput.Address` for service tx chaining.
- Intermediate owner semantics are explicit and deterministic.
- Targeted tests pass.

## Validation

```bash
npm run build -- --pretty false
npm test -- --runInBand tests/dstas-bundle-factory.test.ts tests/dstas-flow.test.ts tests/dstas-state-flows.test.ts tests/dstas-swap-flows.test.ts tests/dstas-multisig-authority-flow.test.ts
```

## Commit expectation

- Commit message suggestion: `fix(dstas): preserve owner context in service planning`
