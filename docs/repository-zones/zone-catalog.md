# Repository Zone Catalog

This file is the canonical zone map for `dxs-bsv-token-sdk`.

## Zones

### Z1. Canonical DSTAS Surface

Paths:

- `src/dstas.ts`
- `src/dstas-factory.ts`
- `src/dstas-bundle-factory.ts`
- `src/dstas-tx-assembly.ts`
- `src/script/**`
- `tests/dstas-*.test.ts`
- `tests/helpers/**`
- `tests/fixtures/**`

Primary owner:

- `@panagushin`

Backup owner:

- unassigned

In scope:

- DSTAS protocol behavior
- DSTAS flow builders
- script parsing/decomposition/evaluation helpers
- conformance vectors and DSTAS regression tests

Out of scope:

- legacy STAS workflow behavior unless explicitly required for compatibility
- repository governance artifacts

### Z2. Low-Level BSV Core

Paths:

- `src/bsv.ts`
- `src/bitcoin/**`
- `src/buffer/**`
- `src/security/**`
- `src/transaction/**`
- `tests/address-outpoint.test.ts`
- `tests/buffer-utils.test.ts`
- `tests/bytes-utils.test.ts`
- `tests/mnemonic.test.ts`
- `tests/private-key.test.ts`
- `tests/token-scheme.test.ts`
- `tests/transaction-*.test.ts`
- `tests/script-*.test.ts`
- `tests/strict-mode.test.ts`

Primary owner:

- `@panagushin`

Backup owner:

- unassigned

In scope:

- blockchain primitives
- serialization/parsing
- low-level transaction and script tooling
- security defaults and crypto wrappers

Out of scope:

- DSTAS protocol-specific business semantics unless they require core support

### Z3. Older STAS Workflow Surface

Paths:

- `src/stas.ts`
- `src/stas-bundle-factory.ts`
- `src/transaction-factory.ts`
- `tests/stas-transactios.ts`

Primary owner:

- `@panagushin`

Backup owner:

- unassigned

In scope:

- older, lower-level STAS helpers
- compatibility maintenance for the STAS namespace

Out of scope:

- new DSTAS protocol work

### Z4. Governance And Agent Surface

Paths:

- `AGENTS.md`
- `src/AGENTS.md`
- `tests/AGENTS.md`
- `llms.txt`
- `README.md`
- `docs/**`
- `.github/CODEOWNERS`
- `.github/pull_request_template.md`

Primary owner:

- `@panagushin`

Backup owner:

- unassigned

In scope:

- onboarding docs
- AI-first governance
- stream task orchestration artifacts
- repository-level workflow guidance

Out of scope:

- protocol/runtime behavior except where documentation must reflect it

## Canonicality rules

- `README.md`, `AGENTS.md`, `docs/AGENT_RUNBOOK.md`, `docs/DSTAS_SDK_SPEC.md`, `docs/DSTAS_SCRIPT_INVARIANTS.md`, and `docs/DSTAS_CONFORMANCE_MATRIX.md` are canonical guidance.
- New product behavior should be documented in canonical docs, not only in stream-task packages.
