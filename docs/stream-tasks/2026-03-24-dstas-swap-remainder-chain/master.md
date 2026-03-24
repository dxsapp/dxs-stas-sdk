# DSTAS Swap Remainder Chain - Master Task Package

- Package: `2026-03-24-dstas-swap-remainder-chain`
- Operator stream: `operator`
- Status: `in_progress`
- Repository: `/Users/imighty/Code/dxs-stas-sdk`

## Goal

Add an explicit regression test for chained partial swap remainder spending:

1. a swap-marked DSTAS UTXO is partially consumed;
2. the seller remainder stays swap-marked;
3. that remainder is spent again in another partial swap;
4. the process repeats for multiple generations;
5. piece-based swap reconstruction remains valid at each generation.

## Streams

| Stream                       | Lane    | Backend substream | Status      | Depends on                           | Model     | Reason                                      |
| ---------------------------- | ------- | ----------------- | ----------- | ------------------------------------ | --------- | ------------------------------------------- |
| operator                     | -       | -                 | in_progress | -                                    | reasoning | Own sequencing, monitoring, and closeout    |
| delivery-backend-reliability | backend | BE-Reliability    | in_progress | -                                    | Codex     | Add focused regression suite and assertions |
| delivery-backend-platform    | backend | BE-Platform       | blocked     | reliability escalation only          | Codex     | Only if the test exposes a real SDK seam    |
| delivery-backend-contracts   | backend | BE-Contracts      | blocked     | reliability/platform escalation only | Codex     | Only if a protocol helper gap is exposed    |

## Scope

Primary target:

- `tests/dstas-swap-remainder-chain.test.ts`

Likely helper touch points:

- `tests/helpers/dstas-flow-shared.ts`
- `tests/helpers/fee-assertions.ts`

## Required coverage

- at least 3 sequential partial swaps on the same seller remainder lineage
- each next partial swap must spend the previous remainder output, not a fresh unrelated output
- each remainder output must preserve swap semantics (`actionData`, `requestedScriptHash`, etc.)
- full `evaluateTransactionHex(...)` validation on every swap tx
- at least 1 negative case on a second- or third-generation remainder (wrong script / wrong pieces / wrong requestedScriptHash)

## Acceptance criteria

- Focused remainder-chain suite passes deterministically.
- Existing swap suites stay green.
- If a real SDK seam is found, reliability produces a minimal escalation note with failing step and exact file/function boundary.

## Validation

```bash
npm run build -- --pretty false
npm test -- --runInBand tests/dstas-swap-remainder-chain.test.ts tests/dstas-swap-flows.test.ts tests/dstas-swap-mode.test.ts
```
