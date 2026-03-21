# Stream Task - Delivery Integration

- Stream: `delivery`
- Lane: `integration`
- Zone: `Z3 - Public API, Packaging, Integration Surface`
- Status: `done`
- Depends on: `delivery-backend-platform done`

## Goal

Switch the public package surface to namespace-only exports: `dstas`, `stas`, `bsv`.

## In scope

- `/Users/imighty/Code/dxs-stas-sdk/src/index.ts`
- `/Users/imighty/Code/dxs-stas-sdk/src/dstas.ts`
- `/Users/imighty/Code/dxs-stas-sdk/src/stas.ts`
- `/Users/imighty/Code/dxs-stas-sdk/src/bsv.ts` (new)
- `/Users/imighty/Code/dxs-stas-sdk/package.json`
- `/Users/imighty/Code/dxs-stas-sdk/README.md`
- Package smoke/export tests

## Tasks

1. Remove flat root exports.
2. Make root export only `dstas`, `stas`, and `bsv`.
3. If appropriate, add `dxs-stas-sdk/bsv` subpath.
4. Update README and package smoke/export tests to the new contract.

## Acceptance criteria

- Root package surface is namespace-only.
- Consumers can use canonical `dstas` / `stas` / `bsv` entrypoints.
- Tests reflect the new contract.

## Validation

```bash
npm run build -- --pretty false
npm test -- --runInBand tests/package-smoke.test.ts tests/package-exports.test.ts tests/root-namespace-exports.test.ts
```

## Commit expectation

- Commit message suggestion: `refactor(exports): switch root package to dstas stas bsv namespaces`
