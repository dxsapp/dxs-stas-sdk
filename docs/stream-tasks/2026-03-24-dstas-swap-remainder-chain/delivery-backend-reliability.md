# Stream Task - Delivery Backend Reliability

- Stream: `delivery`
- Lane: `backend`
- Backend substream: `BE-Reliability`
- Zone: `Z4 - Test & Conformance`
- Status: `in_progress`
- Depends on: `-`

## Goal

Implement a focused regression test for chained partial swap remainder spending.

## In scope

- `tests/dstas-swap-remainder-chain.test.ts`
- test helper adjustments only if they directly support this suite

## Tasks

1. Reuse canonical DSTAS helpers and imports (`dxs-stas-sdk/dstas`, `dxs-stas-sdk/bsv` style inside repo tests where applicable).
2. Build a scenario with one swap-marked seller leg and at least three sequential partial swaps.
3. After each swap, assert the seller remainder:
   - exists,
   - is the leg consumed by the next swap,
   - stays swap-marked,
   - preserves expected swap context.
4. Validate every tx with `evaluateTransactionHex(...)` and explicit prevout resolver.
5. Add at least one negative case on a later-generation remainder.
6. If the test exposes a real SDK seam, stop and hand off a precise escalation note instead of papering over it in test code.

## Guardrails

- Do not add `.temp` or debug file writes.
- Keep this focused; do not fold it into the master lifecycle test.
- Prefer explicit helper names like `assertSwapMarkedRemainder(...)` or `runPartialSwap(...)` if helper extraction improves clarity.

## Acceptance criteria

- New suite passes and clearly proves remainder chaining.
- Existing swap suites continue to pass.
- Any blocker is escalated with file path, function, and failing invariant.

## Validation

```bash
npm run build -- --pretty false
npm test -- --runInBand tests/dstas-swap-remainder-chain.test.ts tests/dstas-swap-flows.test.ts tests/dstas-swap-mode.test.ts
```

## Commit expectation

- Commit message suggestion: `test(dstas): add swap remainder chain regression`
