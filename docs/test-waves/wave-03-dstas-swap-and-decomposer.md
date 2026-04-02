# Wave 03 — DSTAS Swap Helper And Decomposer

## Status

`done`

## Goal

Deepen unit coverage for the new DSTAS swap template helpers and locking-script decomposition logic.

## Coverage Targets

- `src/script/dstas-swap-script.ts >= 80%`
- `src/script/read/dstas-locking-script-decomposer.ts >= 75%`

## Owned Suites

- `tests/dstas-swap-script.test.ts`
- `tests/dstas-locking-decomposer.test.ts`

## Scope

### `dstas-swap-script.ts`

Add tests for:

- `readRawChunk(...)` with:
  - direct push
  - `OP_PUSHDATA1`
  - `OP_PUSHDATA2`
  - `OP_PUSHDATA4`
  - malformed chunks returning `undefined`
- `extractDstasCounterpartyScript(...)` with:
  - variable-length owner push
  - variable-length second field
  - malformed owner field
  - malformed second field
- `splitDstasPreviousTransactionByCounterpartyScript(...)` with:
  - adjacent matches
  - single-byte script
  - large pieces
  - repeated matches beyond current happy-path coverage

### `dstas-locking-script-decomposer.ts`

Add tests for:

- missing action data
- script shorter than template base
- base mismatch
- invalid redemption field
- failed tail chunk parse
- `OP_0` flags branch
- flags pushdata branch with:
  - freeze only
  - confiscation only
  - both enabled
- service fields fewer than expected
- extra pushdatas accumulating into `optionalDataHexes`
- trailing opcodes collected into `trailingOpcodes`

## Validation

Focused:

```bash
PATH=/usr/local/bin:$PATH npm test -- --runInBand tests/dstas-swap-script.test.ts tests/dstas-locking-decomposer.test.ts
```

Then:

```bash
PATH=/usr/local/bin:$PATH npm test -- --coverage --runInBand
```

Wave closeout validation:

```bash
PATH=/usr/local/bin:$PATH npm test -- --runInBand
```

## Delivered Coverage

- `src/script/dstas-swap-script.ts`: `90.9%` statements, `82.22%` branches, `98.48%` lines
- `src/script/read/dstas-locking-script-decomposer.ts`: `92.78%` statements, `87.5%` branches, `100%` lines

Repo baseline after this wave:

- full suite: `38/38` suites passed, `1` suite skipped intentionally
- tests: `253/254` passed, `1` skipped
- coverage:
  - statements: `85.51%`
  - branches: `73.87%`
  - functions: `95.09%`
  - lines: `87.60%`

Implementation commit:

- `685984e` — `test: deepen W3 DSTAS helper coverage`

## Done When

- both target files reach their target coverage
- no new DSTAS swap/lifecycle regressions appear in full suite

## Residuals

- No wave-local residuals. `W4` remains the next open hotspot by the package execution order.
