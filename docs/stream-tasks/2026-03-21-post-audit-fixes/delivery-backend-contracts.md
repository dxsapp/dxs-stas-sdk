# Stream Task - Delivery Backend Contracts

- Stream: `delivery`
- Lane: `backend`
- Backend substream: `BE-Contracts`
- Zone: `Z1 - Protocol Core`
- Status: `in_progress`
- Depends on: `none`

## Goal

Make the SDK safe-by-default at parser/evaluator boundaries and normalize malformed-input behavior.

## In scope

- `/Users/imighty/Code/dxs-stas-sdk/src/security/**`
- `/Users/imighty/Code/dxs-stas-sdk/src/script/read/**`
- `/Users/imighty/Code/dxs-stas-sdk/src/script/eval/**`
- `/Users/imighty/Code/dxs-stas-sdk/src/bitcoin/out-point.ts`
- Protocol-focused tests needed to lock behavior

## Tasks

1. Enable strict parser/evaluator/outpoint guardrails by default.
2. Ensure malformed pushdata in locking-script reading is a hard malformed/failure path, not a normal `unknown`/`nullData` degradation.
3. Normalize `OP_CHECKMULTISIG` malformed signature/pubkey handling to deterministic script failure semantics matching `OP_CHECKSIG`.
4. Update/add tests to prove the new boundaries.

## Acceptance criteria

- `strictOutPointValidation`, `strictScriptReader`, and `strictScriptEvaluation` are on by default.
- Malformed locking-script pushdata is distinguishable from unsupported-but-valid scripts.
- Multisig verify path no longer leaks raw library errors for malformed inputs.
- Relevant targeted tests pass.

## Validation

```bash
npm run build -- --pretty false
npm test -- --runInBand tests/strict-mode.test.ts tests/locking-script-reader.test.ts tests/script-read.test.ts tests/script-eval.test.ts tests/address-outpoint.test.ts
```

## Commit expectation

- Commit message suggestion: `fix(protocol): harden strict defaults and malformed script handling`
