# Ownership Matrix

| Zone                            | Primary       | Backup     | Paths                                                                                                     |
| ------------------------------- | ------------- | ---------- | --------------------------------------------------------------------------------------------------------- |
| Z1 Canonical DSTAS Surface      | `@panagushin` | unassigned | `src/dstas*`, `src/script/**`, `tests/dstas-*.test.ts`, `tests/helpers/**`, `tests/fixtures/**`           |
| Z2 Low-Level BSV Core           | `@panagushin` | unassigned | `src/bsv.ts`, `src/bitcoin/**`, `src/buffer/**`, `src/security/**`, `src/transaction/**`, low-level tests |
| Z3 Older STAS Workflow Surface  | `@panagushin` | unassigned | `src/stas.ts`, `src/stas-bundle-factory.ts`, `src/transaction-factory.ts`, `tests/stas-transactios.ts`    |
| Z4 Governance And Agent Surface | `@panagushin` | unassigned | `AGENTS.md`, scoped `AGENTS.md`, `llms.txt`, `README.md`, `docs/**`, `.github/**`                         |

## Notes

- This repository currently has a single named owner. Backup ownership is intentionally marked `unassigned` rather than inventing a second maintainer.
- When a second maintainer exists, update this file and `.github/CODEOWNERS` together.
- `docs/stream-tasks/**` belongs to Z4 and is operational, not normative.
