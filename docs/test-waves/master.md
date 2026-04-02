# Test Waves Master

This package is the durable test roadmap for `dxs-bsv-token-sdk`.

It replaces ad hoc operator task logs with one canonical testing plan that can be extended over time without reintroducing non-canonical delivery history into the repo.

## Goals

- Keep the DSTAS surface release-grade and regression-resistant.
- Raise low-level coverage where parser, builder, and model failures are expensive.
- Preserve a clear split between:
  - protocol conformance
  - lifecycle flows
  - low-level unit coverage
  - legacy STAS maintenance coverage

## Current Baseline

Latest validated baseline:

- full suite: `38/38` suites passed, `1` suite skipped intentionally
- tests: `260/261` passed, `1` skipped
- coverage:
  - statements: `87.14%`
  - branches: `74.90%`
  - functions: `95.88%`
  - lines: `89.30%`

## Validation Commands

Use:

```bash
PATH=/usr/local/bin:$PATH npm test -- --runInBand
PATH=/usr/local/bin:$PATH npm test -- --coverage --runInBand
PATH=/usr/local/bin:$PATH npm run lint
```

For focused waves, run only the suites owned by that wave before full-suite validation.

## Wave Ledger

| Wave | Scope                                                                              | Status | Done When                                                                         |
| ---- | ---------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------- |
| `W1` | Existing DSTAS conformance, lifecycle, multisig, swap, redeem, package surface     | `done` | Full DSTAS protocol and package surface already covered by canonical suites       |
| `W2` | Low-level parser, builder, model, and helper edge coverage                         | `done` | New focused suites merged and baseline coverage raised                            |
| `W3` | `dstas-swap-script.ts` and `dstas-locking-script-decomposer.ts` deep unit coverage | `done` | `dstas-swap-script.ts >= 80%`, `dstas-locking-script-decomposer.ts >= 75%`        |
| `W4` | `stas-bundle-factory.ts` legacy maintenance coverage                               | `done` | `stas-bundle-factory.ts >= 70%`                                                   |
| `W5` | Remaining hotspots after W3/W4                                                     | `todo` | Hotspots are either raised materially or explicitly accepted as low-priority debt |

## Wave Files

- `docs/test-waves/wave-01-existing-surface.md`
- `docs/test-waves/wave-02-low-level-edge-coverage.md`
- `docs/test-waves/wave-03-dstas-swap-and-decomposer.md`
- `docs/test-waves/wave-04-legacy-stas-bundle.md`
- `docs/test-waves/wave-05-remaining-hotspots.md`

## Test Ownership Rules

- Keep DSTAS lifecycle/state-machine expansion in the existing lifecycle suites and helpers.
- Keep low-level branch coverage in focused unit suites instead of inflating flow tests.
- Keep legacy STAS maintenance coverage isolated from DSTAS-focused suites.
- Every new wave must end with:
  - focused suite pass
  - full suite pass
  - coverage rerun
  - updated targets/status in this package

## Implementation Commits

- `W3`: `685984e` — `test: deepen W3 DSTAS helper coverage`
- `W4`: `1d84711` — `test: harden W4 legacy bundle coverage`
