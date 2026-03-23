# Stream Task - Delivery Backend Platform

- Stream: `delivery`
- Lane: `backend`
- Backend substream: `BE-Platform`
- Status: `done`
- Depends on: `delivery-backend-contracts done`

## Goal

Wire the new swap format into the transaction builder/runtime path.

## In scope

- `/Users/imighty/Code/dxs-stas-sdk/src/dstas-factory.ts`
- `/Users/imighty/Code/dxs-stas-sdk/src/dstas-tx-assembly.ts`
- `/Users/imighty/Code/dxs-stas-sdk/src/transaction/build/input-builder.ts`
- `/Users/imighty/Code/dxs-stas-sdk/src/script/build/unlocking-script-builder.ts` if needed
- Swap-related DSTAS helpers/tests needed for builder integration

## Tasks

1. Replace whole-counterparty-tx swap payload generation with `counterpartyOutpointIndex + pieces[] + piecesCount + counterpartyScript + spendingType=1`.
2. Use the protocol helpers from the contracts stream to derive `counterpartyScript` and `pieces[]`.
3. Update size accounting / `unlockingScriptSize()` so fee estimation reflects the new swap payload.
4. Keep the rest of the swap/funding path intact.

## Validation

```bash
npm run build -- --pretty false
npm test -- --runInBand tests/dstas-swap-mode.test.ts tests/dstas-swap-flows.test.ts tests/dstas-flow.test.ts tests/transaction-build.test.ts
```

## Commit expectation

- Commit message suggestion: `fix(dstas): build swap unlock from script pieces`
