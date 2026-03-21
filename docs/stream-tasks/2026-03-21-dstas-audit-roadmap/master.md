# DSTAS Audit Roadmap - Master Task Package

- Package: `2026-03-21-dstas-audit-roadmap`
- Operator stream: `operator`
- Status: `todo`
- Repository: `/Users/imighty/Code/dxs-stas-sdk`

## Goal

Drive the remaining audit program for DSTAS/STAS SDK to completion without context drift.

## Streams

| Stream                       | Lane        | Backend substream | Status      | Depends on                 | Model            | Reason                                                             |
| ---------------------------- | ----------- | ----------------- | ----------- | -------------------------- | ---------------- | ------------------------------------------------------------------ |
| operator                     | -           | -                 | in_progress | -                          | Reasoning (high) | Own sequencing, dependency gates, and closeout                     |
| delivery-backend-contracts   | backend     | BE-Contracts      | todo        | -                          | Codex            | Protocol/parser/security invariants sit here                       |
| delivery-backend-platform    | backend     | BE-Platform       | blocked     | delivery-backend-contracts | Codex            | Assembly/planning depends on protocol guardrails                   |
| delivery-backend-reliability | backend     | BE-Reliability    | blocked     | delivery-backend-contracts | Codex            | Negative corpus and malformed coverage depend on parser decisions  |
| delivery-integration         | integration | -                 | blocked     | delivery-backend-platform  | Codex-Spark      | Packaging/integration smoke should run on stabilized assembly path |

## Wave order

1. `delivery-backend-contracts`
2. `delivery-backend-reliability`
3. `delivery-backend-platform`
4. `delivery-integration`
5. operator closeout

## Global acceptance criteria

- Parser/protocol boundaries are hardened and covered by malformed-input tests.
- Security/misuse invariants are expressed as script-level negative tests.
- DSTAS transaction construction remains canonical and deterministic.
- Package export/import contract is validated from consumer perspective.
- Final report records what is closed, what remains partial, and exact follow-up owners.

## Deliverables

- `delivery-backend-contracts.md`
- `delivery-backend-reliability.md`
- `delivery-backend-platform.md`
- `delivery-integration.md`

## Operator monitoring rules

- Do not mark downstream stream runnable until upstream dependency is `done` with evidence.
- Require commit hash or explicit no-code evidence for every `done` stream.
- Re-open any stream that reports `done` without validation evidence.
