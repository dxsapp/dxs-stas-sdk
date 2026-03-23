# Stream Task - Delivery Backend Reliability

- Stream: `delivery`
- Lane: `backend`
- Backend substream: `BE-Reliability`
- Zone: `Z4 - Test & Conformance`
- Status: `done`
- Depends on: `platform/integration/contracts done`

## Goal

Lock the canonical-only surface and service-planning semantics with deterministic tests.

## In scope

- `/Users/imighty/Code/dxs-stas-sdk/tests/**`

## Tasks

1. Update tests to canonical `scheme` only.
2. Remove alias-compatibility tests or replace them with canonical-only checks.
3. Add regression coverage for owner-aware service planning.
4. Update package smoke/export tests if upstream changes require it.
5. Run full in-band suite.

## Acceptance criteria

- Tests lock canonical-only behavior.
- No CI-facing test depends on removed non-canonical field names.
- Full suite passes.

## Validation

```bash
npm run build -- --pretty false
npm test -- --runInBand
```

## Commit expectation

- Commit message suggestion: `test(api): align canonical package contract`
