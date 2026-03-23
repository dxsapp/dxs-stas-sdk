# Stream Task - Delivery Integration

- Stream: `delivery`
- Lane: `integration`
- Zone: `Z3 - Public API, Packaging, Integration Surface`
- Status: `done`
- Depends on: `delivery-backend-platform done`

## Goal

Harden the published package contract and reduce DSTAS/STAS API ambiguity for consumers.

## In scope

- `/Users/imighty/Code/dxs-stas-sdk/package.json`
- `/Users/imighty/Code/dxs-stas-sdk/src/index.ts`
- `/Users/imighty/Code/dxs-stas-sdk/src/dstas.ts`
- `/Users/imighty/Code/dxs-stas-sdk/src/stas.ts`
- `/Users/imighty/Code/dxs-stas-sdk/README.md`
- Package smoke/export tests

## Tasks

1. Replace the current tarball smoke setup with a real clean consumer install path.
2. Unify the most confusing request-shape naming mismatch in the public API.
3. Narrow/clarify the root package surface so canonical DSTAS/STAS entrypoints are preferred over low-level internals.
4. Reduce README onboarding noise and keep it DSTAS-first.

## Acceptance criteria

- Package smoke test models a real consumer install sufficiently to catch dependency/export contract issues.
- Public API ambiguity is reduced and documented.
- Root exports and README point developers toward the intended protocol entrypoints.

## Validation

```bash
npm run build -- --pretty false
npm test -- --runInBand tests/package-smoke.test.ts tests/package-exports.test.ts tests/root-namespace-exports.test.ts
```

## Commit expectation

- Commit message suggestion: `fix(integration): harden package consumer contract`
