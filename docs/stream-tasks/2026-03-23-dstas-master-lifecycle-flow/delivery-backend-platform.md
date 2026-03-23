# Stream Task - Delivery Backend Platform

- Package: `2026-03-23-dstas-master-lifecycle-flow`
- Stream: `delivery-backend-platform`
- Lane: `backend`
- Backend substream: `BE-Platform`
- Status: `blocked`
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
