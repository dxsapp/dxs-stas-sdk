# Canonical Surface Cleanup - Master Task Package

- Package: `2026-03-21-canonical-surface-cleanup`
- Operator stream: `operator`
- Status: `done`
- Repository: `/Users/imighty/Code/dxs-stas-sdk`

## Goal

Complete the final canonical-surface cleanup across DSTAS service planning, namespace-only package exports, and canonical field naming.

## Streams

| Stream                       | Lane        | Backend substream | Status      | Depends on                     | Model     | Reason                                                            |
| ---------------------------- | ----------- | ----------------- | ----------- | ------------------------------ | --------- | ----------------------------------------------------------------- |
| operator                     | -           | -                 | in_progress | -                              | reasoning | Own sequencing, dependency gates, and closeout                    |
| delivery-backend-platform    | backend     | BE-Platform       | in_progress | -                              | Codex     | Owner-aware service planning and intermediate UTXO reconstruction |
| delivery-integration         | integration | -                 | blocked     | delivery-backend-platform done | Codex     | Move public package surface to `dstas` / `stas` / `bsv`           |
| delivery-backend-contracts   | backend     | BE-Contracts      | blocked     | delivery-integration done      | Codex     | Enforce canonical field names                                     |
| delivery-backend-reliability | backend     | BE-Reliability    | blocked     | platform/integration/contracts | Codex     | Lock canonical-only behavior with regression coverage             |

## Wave order

1. `delivery-backend-platform`
2. `delivery-integration`
3. `delivery-backend-contracts`
4. `delivery-backend-reliability`
5. operator closeout

## Global acceptance criteria

- Service transactions preserve known owner semantics without synthetic addresses.
- Root package exports only `dstas`, `stas`, and `bsv` namespaces.
- Non-canonical field names are removed from runtime, types, and docs.
- Regression coverage is canonical-only and remains hermetic.

## Operator monitoring rules

- Do not start downstream streams before upstream dependency is `done` with validation evidence.
- Require commit hash and commands/results for every `done` stream.
- Re-open any stream that keeps a non-canonical field or export contract beyond the approved surface.
