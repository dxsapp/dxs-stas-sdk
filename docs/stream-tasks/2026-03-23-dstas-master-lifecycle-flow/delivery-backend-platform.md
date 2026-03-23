# Stream Task - Delivery Backend Platform

- Package: `2026-03-23-dstas-master-lifecycle-flow`
- Stream: `delivery-backend-platform`
- Lane: `backend`
- Backend substream: `BE-Platform`
- Status: `done`
- Repository: `/Users/imighty/Code/dxs-stas-sdk`

## Goal

Patch production or test-support seams only if the master lifecycle driver exposes concrete builder/planner/runtime gaps.

## Scope

Candidate paths only when explicitly required by a reliability blocker:

- `/Users/imighty/Code/dxs-stas-sdk/src/dstas-factory.ts`
- `/Users/imighty/Code/dxs-stas-sdk/src/dstas-bundle-factory.ts`
- `/Users/imighty/Code/dxs-stas-sdk/src/dstas-tx-assembly.ts`
- `/Users/imighty/Code/dxs-stas-sdk/src/transaction/**`
- `/Users/imighty/Code/dxs-stas-sdk/src/script/build/**`

Out of scope without an operator unblock:

- test-only fixtures and driver DSL
- protocol/parser semantics unless delegated to BE-Contracts

## Unblock condition

Do not start implementation until `delivery-backend-reliability` produces a concrete blocker with:

- failing lifecycle step
- failing API seam or builder path
- expected minimal contract
- evidence that the gap cannot be solved in tests alone

## Candidate task types

1. Add a small test-support seam for deterministic builder orchestration.
2. Expose missing metadata needed to keep the world model accurate.
3. Fix planner/finalize behavior if the lifecycle uncovers a real runtime bug.
4. Improve fee sizing hooks only if the lifecycle suite cannot assert fee bounds without it.

## Acceptance criteria

- Any product patch is minimal and justified by a failing lifecycle step.
- The patch does not broaden public API surface unless unavoidable.
- Existing DSTAS suites remain green.

## Validation

Minimum on handoff:

```bash
npm run build -- --pretty false
npm run lint
npm test -- --runInBand <affected tests>
```

If a runtime bug is fixed, include the master lifecycle suite in the rerun list.

## Commit expectation

Commit only platform-owned product/test-support patches.

Suggested commit message:

- `fix(dstas): support master lifecycle driver <short reason>`

On completion, update this file to `done` with commit hash and unblock evidence.

## Active blocker

- Source stream: `delivery-backend-reliability`
- Failing operation: merge two same-owner DSTAS outputs (`ownerA: 40 + 10`) produced by a prior canonical DSTAS split
- Reproduction entry: `/Users/imighty/Code/dxs-stas-sdk/tests/dstas-master-lifecycle.test.ts` via `merge(world, { assetId: "assetA", from: "ownerA", left: 40, right: 10, to: "ownerA", step: "assetA merge ownerA fragments" })`
- Entry path in production API: `/Users/imighty/Code/dxs-stas-sdk/src/dstas-factory.ts:652` via `BuildDstasMergeTx(...)`
- Suspect runtime seam: `/Users/imighty/Code/dxs-stas-sdk/src/transaction/build/input-builder.ts:496-513`
- Observed evaluation failure: `OP_NUMEQUALVERIFY failed` on both DSTAS inputs
- Strong suspect: `prepareMergeInfo()` for `ScriptType.dstas` is assigning `_mergeSegments = [mergeRaw]` and returning, instead of cutting/reconstructing merge payload from DSTAS script identity/tail semantics.
- Expected minimal contract: two same-owner DSTAS outputs created by a canonical DSTAS split must merge successfully through `BuildDstasMergeTx(...)` and pass `evaluateTransactionHex(...)` with explicit prevout resolution.

## Completion

- Commit: `18a2172` — `fix(dstas): restore merge payload for split outputs`
- Validation:
  - `npm run build -- --pretty false`
  - `npm run lint`
  - `npm test -- --runInBand tests/dstas-master-lifecycle.test.ts tests/dstas-flow.test.ts tests/dstas-state-flows.test.ts tests/dstas-swap-flows.test.ts tests/transaction-build.test.ts`
- Result:
  - `5/5` suites passed
  - `57/57` tests passed

## Unblock evidence

- The accepted master-lifecycle reproduction now passes with a real merge step (`ownerA: 40 + 10 -> 50`).
- Existing DSTAS swap flows remain green, so the fix stays scoped to actual merge semantics instead of regressing swap encoding.
