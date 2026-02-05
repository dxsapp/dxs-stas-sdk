Summary

- Added a Script evaluator for test-time execution, including signature checking and optional OP_RETURN allowance.
- Added STAS 3.0 freeze+multisig template support with token-based builders (no ASM dependency) and precompiled base tokens.
- Split STAS 3.0 transaction building into `stas30-factory.ts` while keeping legacy STAS v1 logic in `transaction-factory.ts`.
- Added STAS 3.0 script samples and expanded `ScriptToken` flags metadata.
- Added unlocking-script builder helpers and refreshed documentation.

Key files

- `src/script/eval/script-evaluator.ts`, `tests/script-eval.test.ts`
- `src/script/build/stas3-freeze-multisig-builder.ts`
- `src/script/templates/stas3-freeze-multisig-base.ts`, `src/script/templates/stas3-freeze-multisig.ts`
- `src/script/build/unlocking-script-builder.ts`, `src/script/script-samples.ts`, `src/script/script-token.ts`
- `src/stas30-factory.ts`, `src/transaction-factory.ts`, `src/index.ts`
- `docs/STAS3_FREEZE_MULTISIG.md`, `docs/AGENT_HANDBOOK.md`, `docs/COMMAND_LOG.md`

Notes

- STAS 3.0 scripts are now assembled from `ScriptToken[]` and serialized to bytes; ASM is still available via `toAsm()` for inspection.
- Script evaluation requires `ScriptEvalContext` with the spending transaction and previous outputs.

Commands (recent)

- `node scripts/check-no-buffer.mjs` -- ok
