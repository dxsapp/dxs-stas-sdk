# Wave 05 — Remaining Hotspots

## Status

`todo`

## Goal

Close or explicitly accept the remaining non-blocking coverage hotspots after Waves 03 and 04.

## Candidate Targets

- `src/script/script-samples.ts`
- `src/script/read/base-script-reader.ts` remaining branches
- `src/bitcoin/out-point.ts` remaining strict-validation branches
- `src/bitcoin/mnemonic.ts` remaining failure branches
- `src/transaction-factory.ts` remaining factory branches
- `tests/helpers/dstas-master-driver.ts` branch-heavy helper paths if they become a maintenance risk

## Prioritization Rules

- Prioritize code that is:
  - protocol-significant
  - likely to regress
  - hard to reason about from flow tests alone
- Do not chase coverage mechanically on:
  - sample/demo-only files
  - dead/simple wrappers
  - branches that are materially low-risk and already understood

## Validation

```bash
PATH=/usr/local/bin:$PATH npm test -- --coverage --runInBand
```

## Done When

One of these is true:

- hotspot targets were raised materially and documented here
- or they were reviewed and explicitly accepted as low-priority residual debt
