# AGENTS

Scoped guidance for `src`.

## Zones

- `dstas-factory.ts`, `dstas-bundle-factory.ts`, `dstas-tx-assembly.ts`
  Canonical DSTAS high-level API.
- `script/**`
  Script builders, readers, decomposers, templates, and evaluator-facing helpers.
- `transaction/**`, `bitcoin/**`, `buffer/**`, `security/**`, `bsv.ts`
  Shared low-level core.
- `stas.ts`, `stas-bundle-factory.ts`, `transaction-factory.ts`
  Older, lower-level STAS workflow surface.

## Rules

- New protocol work belongs in DSTAS files, not in the older STAS workflow surface.
- If a DSTAS change requires touching low-level core, keep behavior covered by script-level tests.
- Use `DSTAS` and `actionData`; never use `stas30`, `Stas3`, version-tagged names, or `second field` terminology.
- Use canonical `LockingScript` in new code.
