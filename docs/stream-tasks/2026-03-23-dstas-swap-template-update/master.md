# DSTAS Swap Template Update - Master Task Package

- Package: `2026-03-23-dstas-swap-template-update`
- Operator stream: `operator`
- Status: `done`
- Repository: `/Users/imighty/Code/dxs-stas-sdk`
- Source template: `/Users/imighty/Downloads/Template_STAS_3_0_0_0_9_freeze,_confiscation,_swap,_multisig,_swap.txt`

## Goal

Update the SDK to the new DSTAS swap script format that reconstructs the counterparty previous transaction from `counterpartyScript + piecesCount + pieces[]` instead of receiving the whole counterparty transaction.

## Confirmed protocol notes

- `spendingType=1` remains swap.
- Swap unlock now carries, in stack/ASM order near the swap block: `counterpartyOutpointIndex`, `counterpartyPieces[]`, `counterpartyPiecesCount`, `counterpartyScript`, `spendingType=1`.
- `counterpartyScript` is not extracted by fixed offset. It starts only after the first variable field and the variable-length second field.
- Merge-like reconstruction is still used; the script is reinserted between pieces.

## Streams

| Stream                       | Lane    | Backend substream | Status      | Depends on                 | Model     | Reason                                          |
| ---------------------------- | ------- | ----------------- | ----------- | -------------------------- | --------- | ----------------------------------------------- |
| operator                     | -       | -                 | in_progress | -                          | reasoning | Own sequencing, dependency gates, and closeout  |
| delivery-backend-contracts   | backend | BE-Contracts      | done        | -                          | Codex     | Parser/decomposer semantics for new swap format |
| delivery-backend-platform    | backend | BE-Platform       | done        | delivery-backend-contracts | Codex     | Builder/runtime integration and size accounting |
| delivery-backend-reliability | backend | BE-Reliability    | done        | contracts/platform         | Codex     | Regression, conformance, and negative coverage  |

## Wave order

1. `delivery-backend-contracts`
2. `delivery-backend-platform`
3. `delivery-backend-reliability`
4. operator closeout

## Global acceptance criteria

- SDK extracts `counterpartyScript` via structural parsing, not fixed offsets.
- Swap builder emits `counterpartyOutpointIndex + pieces[] + piecesCount + counterpartyScript + spendingType=1` instead of the whole counterparty transaction.
- `unlockingScriptSize()` reflects the new swap payload.
- Script-level evaluation coverage is updated for the new swap mode.
