# Stream Task - Delivery Integration

- Stream: `delivery`
- Lane: `integration`
- Zone: `Z3 - Public API, Packaging, Integration Surface`
- Status: `done`
- Depends on: `delivery-backend-platform done`

## Goal

Validate the published consumer contract for DSTAS/STAS package entrypoints from outside the repository.

## In scope

- `/Users/imighty/Code/dxs-stas-sdk/package.json`
- `/Users/imighty/Code/dxs-stas-sdk/src/index.ts`
- `/Users/imighty/Code/dxs-stas-sdk/src/dstas.ts`
- `/Users/imighty/Code/dxs-stas-sdk/src/stas.ts`
- consumer smoke harnesses/scripts if needed

## Out of scope

- Production transaction semantics
- Parser hardening

## Required inputs

- Stable assembly/path guarantees from platform stream
- Current README examples

## Tasks

1. Run `npm pack` style smoke validation.
2. Validate consumer imports for:
   - root package
   - `dxs-stas-sdk/dstas`
   - `dxs-stas-sdk/stas`
3. Verify README examples match actual package shape.
4. Record any Node/runtime compatibility assumptions found during smoke testing.

## Acceptance criteria

- Consumer import contract works in a clean external harness.
- README examples are executable or directly truthful.
- Any package-contract gap is fixed or explicitly documented.

## Validation

```bash
npm run build -- --pretty false
npm test -- --runInBand tests/package-exports.test.ts tests/root-namespace-exports.test.ts
npm pack
```

## Commit expectation

- Commit message suggestion: `test(integration): validate package consumer contract`
- Status transitions: `blocked -> in_progress -> done`
- `done` evidence: `d7cc6c0` - tarball/package smoke coverage, cleaned dist, and README/export alignment.
