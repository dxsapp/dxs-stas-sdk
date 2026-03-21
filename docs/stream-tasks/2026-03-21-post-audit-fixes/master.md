# DSTAS Post-Audit Fixes - Master Task Package

- Package: `2026-03-21-post-audit-fixes`
- Operator stream: `operator`
- Status: `done`
- Repository: `/Users/imighty/Code/dxs-stas-sdk`

## Goal

Execute the remaining post-audit fix roadmap to completion across protocol safety, planner correctness, packaging reality checks, API cleanup, and maintainability.

## Streams

| Stream                       | Lane        | Backend substream | Status      | Depends on                      | Model     | Reason                                                       |
| ---------------------------- | ----------- | ----------------- | ----------- | ------------------------------- | --------- | ------------------------------------------------------------ |
| operator                     | -           | -                 | done        | -                               | reasoning | Own sequencing, dependency gates, and closeout               |
| delivery-backend-contracts   | backend     | BE-Contracts      | in_progress | -                               | Codex     | Strict defaults, malformed-script boundary, eval consistency |
| delivery-backend-platform    | backend     | BE-Platform       | done        | delivery-backend-contracts done | Codex     | Planner correctness, issuance seam, fee/perf improvements    |
| delivery-integration         | integration | -                 | done        | delivery-backend-platform done  | Codex     | Real package smoke, API naming, root surface, README cleanup |
| delivery-backend-reliability | backend     | BE-Reliability    | done        | contracts/platform/integration  | Codex     | Final regression coverage and suite decomposition            |

## Wave order

1. `delivery-backend-contracts`
2. `delivery-backend-platform`
3. `delivery-integration`
4. `delivery-backend-reliability`
5. operator closeout

## Global acceptance criteria

- SDK strict defaults are safe-by-default.
- Malformed scripts are distinguished from merely unsupported scripts.
- Planner preserves real DSTAS owner semantics for intermediate outputs.
- Package smoke test models a real consumer install.
- Public API surface is less ambiguous for DSTAS/STAS users.
- Regression coverage reflects the new behavior and stays green.

## Operator monitoring rules

- Do not mark downstream stream runnable until upstream dependency is `done` with validation evidence.
- Require commit hash and commands/results for every `done` stream.
- Re-open any stream that lands a workaround instead of a product fix.
