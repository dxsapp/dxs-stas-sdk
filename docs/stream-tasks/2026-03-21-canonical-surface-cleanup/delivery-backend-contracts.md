# Stream Task - Delivery Backend Contracts

- Stream: `delivery`
- Lane: `backend`
- Backend substream: `BE-Contracts`
- Zone: `Z1 - Protocol Core`
- Status: `done`
- Depends on: `delivery-integration done`

## Goal

Enforce the canonical contract.

## In scope

- `/Users/imighty/Code/dxs-stas-sdk/src/dstas-factory.ts`
- `/Users/imighty/Code/dxs-stas-sdk/src/bitcoin/out-point.ts`
- `/Users/imighty/Code/dxs-stas-sdk/src/bitcoin/transaction-output.ts`
- Canonical docs if required

## Tasks

1. Keep only canonical DSTAS request field naming.
2. Keep only canonical locking-script field naming.
3. Remove any remaining non-canonical field-name mentions tied to those runtime/type surfaces.
4. Add/adjust targeted tests if necessary.

## Acceptance criteria

- Non-canonical runtime/type surfaces are gone.
- Only canonical names remain in code paths and protocol-facing docs.
- Targeted validation passes.

## Validation

```bash
npm run build -- --pretty false
npm test -- --runInBand tests/dstas-flow.test.ts tests/locking-script-canonical.test.ts tests/address-outpoint.test.ts tests/transaction-build.test.ts
```

## Commit expectation

- Commit message suggestion: `refactor(api): enforce canonical field names`
