# Stream Task - Delivery Backend Reliability

- Stream: `delivery`
- Lane: `backend`
- Backend substream: `BE-Reliability`
- Zone: `Z4 - Test & Conformance`
- Status: `blocked`
- Depends on: `delivery-backend-contracts done`

## Goal

Build the malformed-input and misuse regression corpus so parser/security behavior stays hermetic and reviewable.

## In scope

- `/Users/imighty/Code/dxs-stas-sdk/tests/**`

## Out of scope

- Production parser semantics unless required by the contracts stream handoff
- Package/import smoke tests

## Required inputs

- Contracts stream handoff with canonical malformed-input expectations
- Existing DSTAS flow suites and conformance vectors

## Tasks

1. Add malformed-input suites for:
   - truncated pushdata
   - oversized element rejection
   - invalid DSTAS service fields
   - malformed `actionData`
2. Add misuse-focused negative tests where gaps remain:
   - malformed multisig payloads
   - authority escalation attempts
   - forbidden frozen/confiscated paths if uncovered
3. Keep all tests hermetic; no filesystem writes in CI-facing suites.

## Acceptance criteria

- New malformed-input tests fail before fixes and pass after fixes.
- Test helpers remain clearly split between `tests/helpers` and `tests/debug`.
- No CI-facing tests depend on `.temp`.

## Validation

```bash
npm run build -- --pretty false
npm test -- --runInBand tests/script-read.test.ts tests/script-eval.test.ts tests/dstas-flow.test.ts tests/dstas-state-flows.test.ts tests/dstas-swap-flows.test.ts tests/dstas-conformance-vectors.test.ts
```

## Commit expectation

- Commit message suggestion: `test(reliability): add malformed dstas corpus`
- Status transitions: `blocked -> in_progress -> done`
- `done` requires commit hash plus short inventory of new negative cases.
