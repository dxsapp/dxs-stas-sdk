# AGENTS

Scoped guidance for `tests`.

## Zones

- `dstas-*.test.ts`
  Canonical DSTAS behavior and regression coverage.
- `helpers/**`
  Shared deterministic test helpers.
- `fixtures/**`
  Stable CI fixtures and conformance vectors.
- `debug/**`
  Debug/probe helpers only; not authoritative protocol coverage.

## Rules

- Every new DSTAS flow must validate through script evaluation with an explicit prevout resolver.
- Prefer adding deterministic fixtures over reading local files or environment-dependent data.
- Do not store temporary debugging artifacts under `.temp` or depend on them from committed tests.
- Keep negative tests next to the feature they protect.
