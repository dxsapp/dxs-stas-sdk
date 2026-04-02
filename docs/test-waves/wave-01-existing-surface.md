# Wave 01 — Existing Surface

## Status

`done`

## Scope

This wave is already represented by the canonical suite set:

- DSTAS flow and state coverage
- master lifecycle coverage
- swap flow and remainder-chain coverage
- multisig owner / authority coverage
- redeem coverage
- conformance vectors
- package exports and smoke coverage

Primary suite anchors:

- `tests/dstas-flow.test.ts`
- `tests/dstas-state-flows.test.ts`
- `tests/dstas-swap-flows.test.ts`
- `tests/dstas-swap-mode.test.ts`
- `tests/dstas-swap-remainder-chain.test.ts`
- `tests/dstas-master-lifecycle.test.ts`
- `tests/dstas-multisig-authority-flow.test.ts`
- `tests/dstas-conformance-vectors.test.ts`
- `tests/package-smoke.test.ts`
- `tests/package-exports.test.ts`
- `tests/root-namespace-exports.test.ts`

## Role

This wave is the protocol and package regression floor. Future waves must not duplicate these flows unless a low-level branch can only be hit through an end-to-end transaction path.

## Validation

```bash
PATH=/usr/local/bin:$PATH npm test -- --runInBand
```

## Residuals

- Some low-level helper and parser branches were intentionally not forced through these broad DSTAS flows. Those branches belong in later focused waves.
