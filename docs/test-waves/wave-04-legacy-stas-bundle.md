# Wave 04 — Legacy STAS Bundle Factory

## Status

`done`

## Goal

Raise `src/stas-bundle-factory.ts` to a maintainable coverage floor without contaminating DSTAS-focused suites.

## Coverage Target

- `src/stas-bundle-factory.ts >= 70%`

## Owned Suite

- `tests/stas-bundle-factory.test.ts`

## What Is Already Covered

- insufficient token balance
- exact/accumulated STAS UTXO selection
- funding request contract after probe pass
- single-fee-UTXO passthrough
- single-UTXO merge early return
- missing source transaction failure

## Remaining Gaps

Add tests for:

1. `buildFeeTransaction(...)` multi-input path

- build actual fee transaction
- verify returned `feeTransaction` and derived `feeUtxo`

2. `_createBundle(...)` exact-transfer branch

- `stasUtxo.Satoshis === satoshisToSend`
- transfer path selected

3. `_createBundle(...)` split branch

- `stasUtxo.Satoshis > satoshisToSend`
- split path selected

4. `mergeStasTransactions(...)` real merge branch

- at least one successful two-input merge
- fee outpoint updates from merge tx tail

5. `mergeStasTransactions(...)` transfer-after-depth branch

- force `levelsBeforeTransfer === 3`
- validate handoff into transfer branch

6. `buildTransferTransaction(...)`

- note / no-note smoke

7. `buildSplitTransaction(...)`

- note / no-note smoke
- correct remainder destination back to STAS wallet

## Implementation Notes

- Prefer controlled unit mocks for `BuildMergeTx`, `BuildTransferTx`, and `TransactionReader.readHex(...)` where full economic setup is expensive.
- Keep DSTAS paths out of this suite.
- Do not couple this suite to package/export tests.

## Validation

Focused:

```bash
PATH=/usr/local/bin:$PATH npm test -- --runInBand tests/stas-bundle-factory.test.ts
```

Then:

```bash
PATH=/usr/local/bin:$PATH npm test -- --coverage --runInBand
```

Wave closeout validation:

```bash
PATH=/usr/local/bin:$PATH npm test -- --runInBand
PATH=/usr/local/bin:$PATH npm run lint
```

## Delivered Coverage

- `src/stas-bundle-factory.ts`: `99.19%` statements, `100%` branches, `99.13%` lines

Repo baseline after this wave:

- full suite: `38/38` suites passed, `1` suite skipped intentionally
- tests: `260/261` passed, `1` skipped
- coverage:
  - statements: `87.14%`
  - branches: `74.90%`
  - functions: `95.88%`
  - lines: `89.30%`

Implementation commit:

- `1d84711` — `test: harden W4 legacy bundle coverage`

## Done When

- target file reaches `>= 70%`
- full suite stays green

## Residuals

- No `W4`-local residuals. `W5` remains intentionally unopened per the launch prompt stop condition.
