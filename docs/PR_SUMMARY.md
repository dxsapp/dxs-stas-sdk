# Summary

- Added STAS30 flow coverage for `mint -> transfer -> freeze/unfreeze -> redeem`.
- Added swap flow coverage for:
  - swap cancel
  - swap+transfer
  - swap+swap
  - fractional rates
  - one/two remainders
  - frozen-input rejection
- Added owner multisig support for STAS30 locking path and tests for `3-of-5` owner spending.
- Added second-field codec support and requested-script-hash integration from updated protocol notes.
- Switched redemption path to updated P2MPKH-compatible handling and aligned issuer UTXO assumptions.
- Refined unlocking layout handling for with-change/no-change and multi-input merge payload in evaluation path.
- Hardened `unlockingScriptSize()` as deterministic upper-bound for multisig authority path (without signing iterations).
- Updated parser/decomposer usage and `ToAddress` recovery through `LockingScriptReader` where script type is known.

# Key Files

- `src/stas30-factory.ts`
- `src/stas30-bundle-factory.ts`
- `src/transaction/build/input-builder.ts`
- `src/script/read/locking-script-reader.ts`
- `src/script/read/stas3-locking-script-decomposer.ts`
- `src/script/read/stas3-unlocking-script-decomposer.ts`
- `src/script/stas3-second-field.ts`
- `tests/stas30-flow.test.ts`
- `tests/stas30-multisig-authority-flow.test.ts`
- `tests/stas30-bundle-factory.test.ts`
- `tests/locking-script-reader.test.ts`

# Validation

- `lint` passes.
- Full test suite passes in pre-push hook.
- Swap and multisig scenarios are covered by dedicated regression tests.

# Notes

- Debug probe tests intentionally keep `console.log` traces for unlocking-layout diagnostics.
- Swap invariants currently modeled in tests: principal swap legs + optional remainders + per-leg conservation.
