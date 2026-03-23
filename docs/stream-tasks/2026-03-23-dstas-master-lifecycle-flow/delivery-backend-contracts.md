# Stream Task - Delivery Backend Contracts

- Package: `2026-03-23-dstas-master-lifecycle-flow`
- Stream: `delivery-backend-contracts`
- Lane: `backend`
- Backend substream: `BE-Contracts`
- Status: `blocked`
- Repository: `/Users/imighty/Code/dxs-stas-sdk`

## Goal

Patch protocol helper gaps only if the master lifecycle flow exposes missing script-level semantics that cannot be solved in the reliability harness.

## Scope

Candidate paths only when explicitly required:

- `/Users/imighty/Code/dxs-stas-sdk/src/script/**`
- `/Users/imighty/Code/dxs-stas-sdk/src/bitcoin/**`
- `/Users/imighty/Code/dxs-stas-sdk/src/security/**`

Out of scope without an operator unblock:

- planner or builder ergonomics
- package exports or docs
- broad refactors unrelated to a concrete lifecycle failure

## Unblock condition

Do not start implementation until `delivery-backend-reliability` or `delivery-backend-platform` produces a concrete protocol blocker with:

- exact failing lifecycle step
- exact parser/evaluator/helper gap
- expected behavior per DSTAS spec
- minimum patch surface

## Candidate task types

1. Add a protocol helper needed to inspect live DSTAS outputs in the master world model.
2. Fix a decomposition/evaluation edge case revealed by the lifecycle flow.
3. Add canonical parsing support for state assertions if current helpers are insufficient.

## Acceptance criteria

- Any product patch is minimal and spec-driven.
- The change improves protocol introspection or correctness used by the lifecycle suite.
- Existing protocol and DSTAS suites remain green.

## Validation

Minimum on handoff:

```bash
npm run build -- --pretty false
npm run lint
npm test -- --runInBand <affected tests>
```

If the patch affects script semantics, rerun the relevant DSTAS and script-reader/eval suites.

## Commit expectation

Commit only contracts-owned patches.

Suggested commit message:

- `fix(protocol): support master lifecycle assertions <short reason>`

On completion, update this file to `done` with commit hash and unblock evidence.
