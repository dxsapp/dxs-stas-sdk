# Stream Task - Delivery Backend Platform

- Stream: `delivery`
- Lane: `backend`
- Backend substream: `BE-Platform`
- Zone: `Z2 - Transaction Assembly & Planning`
- Status: `blocked`
- Depends on: `delivery-backend-contracts done`

## Goal

Audit and tighten canonical DSTAS transaction assembly, bundle planning, fee/change behavior, and performance-sensitive flow construction.

## In scope

- `/Users/imighty/Code/dxs-stas-sdk/src/dstas-factory.ts`
- `/Users/imighty/Code/dxs-stas-sdk/src/dstas-bundle-factory.ts`
- `/Users/imighty/Code/dxs-stas-sdk/src/dstas-tx-assembly.ts`
- `/Users/imighty/Code/dxs-stas-sdk/src/transaction/**`

## Out of scope

- Parser semantics unless contracts handoff requires assembly adaptation
- npm/package export smoke tests

## Required inputs

- Contracts stream handoff on parser/protocol guardrails
- Current DSTAS flow suites

## Tasks

1. Verify all DSTAS construction paths flow through canonical assembly seams.
2. Audit fee/change correctness across:
   - `1 -> 1`
   - `1 -> N`
   - `N -> 1`
   - `N -> M`
   - swap flows with remainders
3. Audit upper-bound unlocking-size assumptions for owner and authority multisig paths.
4. Add targeted tests or micro-benchmarks where drift risk is high.

## Acceptance criteria

- No hidden alternate DSTAS assembly path remains.
- Bundle planner scenarios are table-driven or explicitly covered.
- Performance-sensitive changes do not weaken determinism or script validity.

## Validation

```bash
npm run build -- --pretty false
npm test -- --runInBand tests/dstas-bundle-factory.test.ts tests/dstas-flow.test.ts tests/dstas-state-flows.test.ts tests/dstas-swap-flows.test.ts tests/transaction-build.test.ts
```

## Commit expectation

- Commit message suggestion: `refactor(platform): tighten dstas assembly audit coverage`
- Status transitions: `blocked -> in_progress -> done`
- `done` requires commit hash plus evidence of canonical-path validation.
