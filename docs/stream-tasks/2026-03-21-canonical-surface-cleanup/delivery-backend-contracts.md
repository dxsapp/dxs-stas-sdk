# Stream Task - Delivery Backend Contracts

- Stream: `delivery`
- Lane: `backend`
- Backend substream: `BE-Contracts`
- Zone: `Z1 - Protocol Core`
- Status: `done`
- Depends on: `delivery-integration done`

## Goal

Remove compatibility aliases and enforce the canonical contract.

## In scope

- `/Users/imighty/Code/dxs-stas-sdk/src/dstas-factory.ts`
- `/Users/imighty/Code/dxs-stas-sdk/src/bitcoin/out-point.ts`
- `/Users/imighty/Code/dxs-stas-sdk/src/bitcoin/transaction-output.ts`
- Canonical docs if required

## Tasks

1. Remove DSTAS `Scheme` alias and leave only `scheme`.
2. Remove `LockignScript` alias and leave only `LockingScript`.
3. Remove any remaining deprecated alias mentions tied to those runtime/type surfaces.
4. Add/adjust targeted tests if necessary.

## Acceptance criteria

- Alias runtime/type surfaces are gone.
- Only canonical names remain in code paths and protocol-facing docs.
- Targeted validation passes.

## Validation

```bash
npm run build -- --pretty false
npm test -- --runInBand tests/dstas-flow.test.ts tests/locking-script-alias.test.ts tests/address-outpoint.test.ts tests/transaction-build.test.ts
```

## Commit expectation

- Commit message suggestion: `refactor(api): remove deprecated aliases`
