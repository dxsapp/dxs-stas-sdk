# Stream Task - Delivery Backend Reliability

- Stream: `delivery`
- Lane: `backend`
- Backend substream: `BE-Reliability`
- Status: `done`
- Depends on: `delivery-backend-contracts done` and `delivery-backend-platform done`

## Goal

Lock the new swap behavior with regression, conformance, and negative tests.

## In scope

- `/Users/imighty/Code/dxs-stas-sdk/tests/**`
- `/Users/imighty/Code/dxs-stas-sdk/tests/fixtures/**`

## Tasks

1. Update swap flow tests to the new payload format.
2. Add explicit tests for variable-length second-field extraction.
3. Add negative tests for wrong `counterpartyScript`, wrong `piecesCount`, missing/reordered pieces, wrong `counterpartyOutpointIndex`.
4. Update conformance vectors if the intentional behavior changes.
5. Keep CI-facing tests hermetic.

## Validation

```bash
npm run build -- --pretty false
npm test -- --runInBand
```

## Commit expectation

- Commit message suggestion: `test(dstas): cover swap script-piece reconstruction`
