# AGENTS

Scoped guidance for `/Users/imighty/Code/dxs-stas-sdk/src`.

## Zones

- `dstas-factory.ts`, `dstas-bundle-factory.ts`
  Canonical DSTAS high-level API.
- `script/*`
  Script builders, readers, decomposers, templates, and evaluator-facing helpers.
- `transaction/*`, `bitcoin/*`, `buffer/*`, `security/*`
  Shared low-level core.
- `stas-bundle-factory.ts`, `transaction-factory.ts`
  Legacy STAS compatibility only.

## Rules

- New protocol work belongs in DSTAS files, not in legacy STAS factories.
- If a DSTAS change requires touching low-level core, keep behavior covered by script-level tests.
- Do not introduce new `stas30`, `Stas3`, version-tagged, or `action data` terminology.
  Use `DSTAS` and `actionData`.
- Do not add new code against deprecated `LockignScript`; use `LockingScript` only.
