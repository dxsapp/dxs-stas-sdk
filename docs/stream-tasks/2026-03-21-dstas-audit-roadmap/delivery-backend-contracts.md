# Stream Task - Delivery Backend Contracts

- Stream: `delivery`
- Lane: `backend`
- Backend substream: `BE-Contracts`
- Zone: `Z1 - Protocol Core`
- Status: `todo`
- Depends on: `none`

## Goal

Complete parser/protocol hardening and define the canonical expected behavior for malformed DSTAS/STAS script payloads.

## In scope

- `/Users/imighty/Code/dxs-stas-sdk/src/script/**`
- `/Users/imighty/Code/dxs-stas-sdk/src/bitcoin/**`
- `/Users/imighty/Code/dxs-stas-sdk/src/security/**`

## Out of scope

- Bundle planner heuristics
- Package exports or npm smoke tests
- README or governance edits except those needed to document protocol decisions

## Required inputs

- `/Users/imighty/Code/dxs-stas-sdk/docs/DSTAS_SDK_SPEC.md`
- `/Users/imighty/Code/dxs-stas-sdk/docs/DSTAS_SCRIPT_INVARIANTS.md`
- `/Users/imighty/Code/dxs-stas-sdk/tests/fixtures/dstas-conformance-vectors.json`

## Tasks

1. Audit parser behavior for malformed pushdata, truncated scripts, oversized elements, and ambiguous token boundaries.
2. Audit DSTAS-specific payload validation for:
   - malformed `actionData`
   - malformed service fields
   - inconsistent owner field encodings
3. Decide and implement canonical failure behavior where current behavior is ambiguous.
4. Add or update tests only for protocol-ground-truth behavior.

## Acceptance criteria

- Every protocol hardening change is covered by deterministic tests.
- Any newly rejected malformed encoding is intentional and documented in code comments or tests.
- No existing valid DSTAS conformance vector regresses.

## Validation

```bash
npm run build -- --pretty false
npm test -- --runInBand tests/script-read.test.ts tests/locking-script-reader.test.ts tests/script-eval.test.ts tests/dstas-conformance-vectors.test.ts
```

## Commit expectation

- Commit message suggestion: `test(protocol): harden dstas parser boundaries`
- Status transitions: `todo -> in_progress -> done`
- `done` requires commit hash plus short note of behavior changes.
