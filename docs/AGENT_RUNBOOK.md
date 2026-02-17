# Agent Runbook

This runbook is the practical workflow for implementing or modifying DSTAS behavior in this SDK.

## 1. Pick the right API level

Use the highest-level API that satisfies the task:

1. `DstasBundleFactory` (`src/dstas-bundle-factory.ts`)
   For many recipients and automatic merge/split/service planning.
2. `BuildDstas*` helpers (`src/dstas-factory.ts`)
   For explicit issue/transfer/freeze/unfreeze/confiscate/swap/redeem flows.
3. `TransactionBuilder` + script builders
   Only when lower-level control is required.

## 2. Keep protocol invariants intact

Before code changes, verify expected behavior against:

- `docs/DSTAS_0_0_8_SDK_SPEC.md`
- `docs/DSTAS_SCRIPT_INVARIANTS.md`

Critical invariant groups:

- flags/service-field coupling and order;
- action-data semantics (neutral/swap);
- optional-data continuity;
- issuer-only redeem rules;
- freeze/confiscation layering;
- multisig bounds (`n <= 5`, no duplicate keys).

## 3. Add or update tests first-class

Primary suites:

- `tests/dstas-flow.test.ts` (end-to-end protocol flows + negative cases)
- `tests/dstas-bundle-factory.test.ts` (high-level planning)
- `tests/dstas-factory-guards.test.ts` (input guards)
- `tests/dstas-conformance-vectors.test.ts` (vector conformance)

Rules:

- Use deterministic fixtures from `tests/fixtures/`.
- Do not depend on local `.temp` files.
- Keep debug-only probes in `tests/debug/`.

## 4. Mandatory script-level validation

For every flow-producing change, evaluate tx hex through script interpreter:

- Use `evaluateTransactionHex` from `src/script/eval/script-evaluator.ts`.
- Use a strict prevout resolver from known outputs.
- Cover both positive and negative paths where applicable.

Minimal expectation in tests:

- `success === true` for valid flow;
- explicit failure reason checks for invalid flow.

## 5. Update docs when behavior changes

When protocol behavior, API shape, or guarantees change, update:

- `README.md` for user-facing API examples;
- `docs/DSTAS_0_0_8_SDK_SPEC.md` for normative rules;
- `docs/DSTAS_CONFORMANCE_MATRIX.md` for coverage mapping.

If vectors changed intentionally, refresh fixtures and note it in PR summary.

## 6. Pre-commit checks

Run:

```bash
npm run build
npm run lint
npm test
```

If only one suite changed, run targeted tests first, then full-suite before merge.

## 7. Common failure modes

- Missing/mismatched prevout resolver entries during evaluation.
- Action-data hash domain drift (`requestedScriptHash` scope regression).
- Wrong service-field order when multiple policy bits are enabled.
- Optional-data dropped on descendant outputs, causing merge/spend failures.
- Treating debug artifacts as fixtures.
