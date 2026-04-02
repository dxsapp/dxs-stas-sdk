# Test Waves Slices

## Program Overview

This package is a durable multi-wave test program for `dxs-bsv-token-sdk`.

Execution order is frozen:

1. `W3` — DSTAS swap helper and decomposer deep unit coverage
2. `W4` — legacy STAS bundle factory maintenance coverage
3. `W5` — remaining hotspots, only after `W3` and `W4` are closed or intentionally deferred

## Wave-by-Wave Decomposition

### Wave `W3`

#### Slice `W3-S1` — `dstas-swap-script.ts`

- Intent:
  - raise helper-level confidence for the new swap template internals
- Owned paths:
  - `src/script/dstas-swap-script.ts`
  - `tests/dstas-swap-script.test.ts`
- Exact task:
  - add branch-deep unit tests for raw chunk parsing, extraction, malformed field handling, and split edge cases
- Do not:
  - move this logic into lifecycle suites
  - change DSTAS runtime behavior unless a real bug is found
- Validation:
  - `PATH=/usr/local/bin:$PATH npm test -- --runInBand tests/dstas-swap-script.test.ts`
- Completion signal:
  - target file reaches `>= 80%`

#### Slice `W3-S2` — `dstas-locking-script-decomposer.ts`

- Intent:
  - make DSTAS locking decomposition failure and tail-layout branches explicit and stable
- Owned paths:
  - `src/script/read/dstas-locking-script-decomposer.ts`
  - `tests/dstas-locking-decomposer.test.ts`
- Exact task:
  - add missing tests for malformed layout, flags variations, service-field cardinality, and tail parsing
- Do not:
  - duplicate coverage already present in `tests/locking-script-reader.test.ts`
  - broaden into unrelated parser files unless a minimal helper case is required
- Validation:
  - `PATH=/usr/local/bin:$PATH npm test -- --runInBand tests/dstas-locking-decomposer.test.ts`
- Completion signal:
  - target file reaches `>= 75%`

### Wave `W4`

#### Slice `W4-S1` — `stas-bundle-factory.ts`

- Intent:
  - move legacy STAS bundle logic from shallow maintenance coverage to a real regression floor
- Owned paths:
  - `src/stas-bundle-factory.ts`
  - `tests/stas-bundle-factory.test.ts`
- Exact task:
  - cover fee-transaction multi-input path, exact/split `_createBundle(...)` branches, real merge path, transfer-after-depth path, and direct build helpers
- Do not:
  - pull DSTAS coverage into this suite
  - make this an end-to-end transaction economics harness when a bounded mock proves the branch safely
- Validation:
  - `PATH=/usr/local/bin:$PATH npm test -- --runInBand tests/stas-bundle-factory.test.ts`
- Completion signal:
  - target file reaches `>= 70%`

### Wave `W5`

#### Slice `W5-S1` — Remaining Hotspots Review

- Intent:
  - either improve or explicitly accept the remaining non-blocking hotspots
- Owned paths:
  - decided from `docs/test-waves/wave-05-remaining-hotspots.md`
- Exact task:
  - pick only the next materially useful hotspot after `W3` and `W4`
- Do not:
  - chase cosmetic coverage numbers
- Validation:
  - `PATH=/usr/local/bin:$PATH npm test -- --coverage --runInBand`
- Completion signal:
  - hotspot raised materially or accepted as residual debt in the package

## Dependency Chain

- `W3-S1` and `W3-S2` can run in parallel, but the wave closes only after both are done.
- `W4-S1` starts after `W3` closeout and coverage rerun.
- `W5-S1` starts only after `W3` and `W4` statuses are final.

## Validation Matrix

| Wave | Focused Validation                                                                               | Required Global Validation                      |
| ---- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `W3` | `npm test -- --runInBand tests/dstas-swap-script.test.ts tests/dstas-locking-decomposer.test.ts` | full suite + coverage rerun                     |
| `W4` | `npm test -- --runInBand tests/stas-bundle-factory.test.ts`                                      | full suite + coverage rerun                     |
| `W5` | target-specific                                                                                  | coverage rerun and, if code changed, full suite |

## Closeout And Audit Rules

After each executed wave:

- update `docs/test-waves/master.md`
- update the wave file status and resulting baseline numbers
- record the implementation commit hash in `master.md`
- keep the package as the only durable source of truth
- do not create a new task-log subtree for the same work
