# Stream Task - Delivery Backend Contracts

- Stream: `delivery`
- Lane: `backend`
- Backend substream: `BE-Contracts`
- Status: `done`
- Depends on: `-`

## Goal

Teach the parser/decomposer layer the new swap format and the new way to extract the counterparty script.

## In scope

- `/Users/imighty/Code/dxs-stas-sdk/src/script/dstas-action-data.ts`
- `/Users/imighty/Code/dxs-stas-sdk/src/script/dstas-requested-script-hash.ts`
- `/Users/imighty/Code/dxs-stas-sdk/src/script/read/dstas-locking-script-decomposer.ts`
- `/Users/imighty/Code/dxs-stas-sdk/src/script/read/dstas-unlocking-script-decomposer.ts`
- `/Users/imighty/Code/dxs-stas-sdk/src/script/read/locking-script-reader.ts`
- `/Users/imighty/Code/dxs-stas-sdk/src/script/identity-field.ts`
- New nearby helper(s) in `/Users/imighty/Code/dxs-stas-sdk/src/script/` if needed

## Tasks

1. Add a canonical helper that extracts `counterpartyScript` from a DSTAS locking script by parsing past the first variable field and variable-length second field.
2. Add helper(s) to split a raw previous transaction by all occurrences of `counterpartyScript`, returning `pieces[]`.
3. Update the DSTAS unlocking decomposer so swap mode understands `counterpartyOutpointIndex`, `counterpartyPieces[]`, `counterpartyPiecesCount`, `counterpartyScript`, `spendingType=1`.
4. Keep the implementation canonical and parser-based; do not use fixed byte offsets.

## Validation

```bash
npm run build -- --pretty false
npm test -- --runInBand tests/locking-script-reader.test.ts tests/script-read.test.ts tests/dstas-action-data.test.ts tests/dstas-swap-mode.test.ts
```

## Commit expectation

- Commit message suggestion: `fix(protocol): add parsed swap script reconstruction helpers`
