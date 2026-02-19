# AGENTS

This file is a fast onboarding entrypoint for AI coding agents working on this repository.

## Read order

1. `/Users/imighty/Code/dxs-stas-sdk/README.md` (public API and examples)
2. `/Users/imighty/Code/dxs-stas-sdk/docs/AGENT_RUNBOOK.md` (task-oriented execution flow)
3. `/Users/imighty/Code/dxs-stas-sdk/docs/DSTAS_0_0_8_SDK_SPEC.md` (normative protocol rules)
4. `/Users/imighty/Code/dxs-stas-sdk/docs/DSTAS_SCRIPT_INVARIANTS.md` (script-level invariants)
5. `/Users/imighty/Code/dxs-stas-sdk/docs/DSTAS_CONFORMANCE_MATRIX.md` (test mapping)

## Preferred implementation path

- Prefer high-level DSTAS APIs first:
  - `DstasBundleFactory` for multi-step payout/split/merge planning.
  - `BuildDstas*` helpers for single-flow transactions.
- Use legacy `stas*` APIs only for compatibility maintenance.

## Mandatory validation rule

For every protocol change or new flow, validate built tx hex with script evaluation:

- Use `evaluateTransactionHex(...)` from `/Users/imighty/Code/dxs-stas-sdk/src/script/eval/script-evaluator.ts`.
- Provide an explicit prevout resolver from known `OutPoint`/transaction fixtures.
- Never mark a DSTAS flow complete without script-level evaluation coverage.

## Testing expectations

- Put deterministic fixtures under `/Users/imighty/Code/dxs-stas-sdk/tests/fixtures/`.
- Keep debug/probe helpers under `/Users/imighty/Code/dxs-stas-sdk/tests/debug/`.
- Do not depend on local `.temp` files in CI-facing tests.
- Update conformance vectors when behavior intentionally changes:
  - `/Users/imighty/Code/dxs-stas-sdk/tests/fixtures/dstas-conformance-vectors.json`

## Safety and constraints

- Keep strict parsing enabled by default (`strictTxParse=true`).
- Keep strict fee-rate validation enabled by default (`strictFeeRateValidation=true`).
- Keep strict script-eval element limit at 1MB unless protocol/perf requirements change (`maxElementSizeBytes=1024*1024`).
- Preserve flags/service-field ordering and optional-data continuity invariants.
- Keep multisig bounds enforced (`m <= n`, `n <= 5`) unless protocol spec changes.
- Avoid silent behavior changes in unlock/signing semantics; cover with negative tests.
- Use canonical `LockingScript` in new code; `LockignScript` exists only as deprecated compatibility alias.

## Standard local commands

```bash
npm install
npm run build
npm run lint
npm test
```

For targeted runs, prefer file-scoped Jest execution over full-suite reruns while iterating.
