# Stream Task - Delivery Backend Reliability

- Stream: `delivery`
- Lane: `backend`
- Backend substream: `BE-Reliability`
- Zone: `Z4 - Test & Conformance`
- Status: `done`
- Depends on: `contracts/platform/integration done`

## Goal

Lock the post-audit fixes with regression coverage and reduce remaining giant-suite risk.

## In scope

- `/Users/imighty/Code/dxs-stas-sdk/tests/**`

## Tasks

1. Add regression tests for strict defaults, malformed-script hard failures, and normalized multisig verify behavior.
2. Add planner regression tests for intermediate DSTAS outputs without exposed addresses.
3. Keep package smoke/export coverage green under the new integration behavior.
4. If still justified after upstream fixes, split the largest DSTAS suites into smaller domain files or shared helpers.

## Acceptance criteria

- New safety/behavior changes are captured in deterministic tests.
- CI-facing tests remain hermetic.
- Suite structure is at least no worse than current, ideally simpler.

## Validation

```bash
npm run build -- --pretty false
npm test -- --runInBand
```

## Commit expectation

- Commit message suggestion: `test(reliability): lock post-audit safety fixes`
