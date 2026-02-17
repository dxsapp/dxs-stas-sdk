# DSTAS Conformance Matrix

This matrix maps normative DSTAS rules to concrete automated tests.

## Core flow coverage

| Rule                                                                | Covered by test                                                                                                                          |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Parametrized conformance vectors (pass/fail baseline)               | `tests/dstas-conformance-vectors.test.ts`                                                                                                |
| Issue transaction is script-valid                                   | `tests/dstas-flow.test.ts` -> `real funding: build contract + issue are valid`                                                           |
| Transfer (no-change) is valid                                       | `tests/dstas-flow.test.ts` -> `real funding: transfer no-change flow is valid`                                                           |
| Transfer (with-change) is valid                                     | `tests/dstas-flow.test.ts` -> `real funding: transfer with-change flow (current failing case)`                                           |
| Freeze authority path is valid                                      | `tests/dstas-flow.test.ts` -> `real funding: freeze flow is valid`                                                                       |
| Frozen owner spend is rejected                                      | `tests/dstas-flow.test.ts` -> `real funding: owner cannot spend frozen utxo`                                                             |
| Unfreeze authority path is valid                                    | `tests/dstas-flow.test.ts` -> `real funding: unfreeze flow is valid`                                                                     |
| Unfrozen owner spend is valid                                       | `tests/dstas-flow.test.ts` -> `real funding: owner can spend unfrozen utxo`                                                              |
| Issuer-only redeem rule                                             | `tests/dstas-flow.test.ts` -> `real funding: redeem by non-issuer is rejected` / `real funding: issuer can redeem after receiving token` |
| Redeem blocked for frozen UTXO                                      | `tests/dstas-flow.test.ts` -> `real funding: issuer cannot redeem frozen utxo`                                                           |
| Full continuation chain (issue->transfer->freeze->unfreeze->redeem) | `tests/dstas-flow.test.ts` -> `real funding: issue -> transfer -> freeze -> unfreeze -> redeem is valid`                                 |

## Confiscation coverage

| Rule                                               | Covered by test                                                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Confiscation authority path is valid               | `tests/dstas-flow.test.ts` -> `real funding: issue -> transfer -> confiscate is valid`                    |
| Frozen UTXO can be confiscated                     | `tests/dstas-flow.test.ts` -> `real funding: authority can confiscate frozen utxo`                        |
| Swap-marked + frozen UTXO can be confiscated       | `tests/dstas-flow.test.ts` -> `real funding: swap-marked -> freeze -> confiscate is valid`                |
| Confiscated output can be spent by new owner       | `tests/dstas-flow.test.ts` -> `real funding: confiscated output is spendable by new owner`                |
| Confiscation without authority is rejected         | `tests/dstas-flow.test.ts` -> `real funding: confiscate without authority rights is rejected`             |
| Confiscation when bit2 is disabled is rejected     | `tests/dstas-flow.test.ts` -> `real funding: confiscate is rejected when scheme has no confiscation flag` |
| Redeem cannot run under confiscation spending type | `tests/dstas-flow.test.ts` -> `real funding: issuer cannot redeem with confiscation spending type`        |

## Swap coverage

| Rule                                             | Covered by test                                                                                                                                                             |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Swap cancel path valid                           | `tests/dstas-flow.test.ts` -> `real funding: swap cancel flow is valid`                                                                                                     |
| Swap+transfer valid                              | `tests/dstas-flow.test.ts` -> `real funding: swap + transfer assets with requestedScriptHash/rate`                                                                          |
| Swap+swap valid                                  | `tests/dstas-flow.test.ts` -> `real funding: swap + swap assets with requestedScriptHash/rate`                                                                              |
| Fractional rates + one remainder                 | `tests/dstas-flow.test.ts` -> `real funding: swap + transfer with one remainder and fractional rate` / `real funding: swap + swap with one remainder and fractional rate`   |
| Fractional rates + two remainders                | `tests/dstas-flow.test.ts` -> `real funding: transfer + swap with two remainders and fractional rate` / `real funding: swap + swap with two remainders and fractional rate` |
| Frozen input cannot be swapped                   | `tests/dstas-flow.test.ts` -> `real funding: swap + transfer rejects frozen swap input` / `real funding: swap + swap rejects frozen input`                                  |
| Swap mode detection (transfer-swap vs swap-swap) | `tests/dstas-swap-mode.test.ts`                                                                                                                                             |

## Multisig + factory guards

| Rule                                           | Covered by test                                                                                                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner multisig output spend is valid           | `tests/dstas-flow.test.ts` -> `real funding: transfer to owner-multisig output is valid` / `real funding: owner-multisig can spend token with m-of-n unlocking` |
| Authority multisig 3-of-5 flow                 | `tests/dstas-multisig-authority-flow.test.ts` -> `dummy funding: issue -> transfer -> freeze(3/5) -> unfreeze(3/5) -> transfer`                                 |
| Merge limited to 2 STAS inputs                 | `tests/dstas-factory-guards.test.ts` -> `merge rejects more than 2 STAS inputs`                                                                                 |
| Bundle transfer planning and large bundle path | `tests/dstas-bundle-factory.test.ts`                                                                                                                            |

## Fee/size safety

| Rule                                                                | Covered by test                                                                                           |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Fee not below target and not above deterministic upper bound window | `tests/dstas-flow.test.ts` -> `real funding: fee is within expected range for built Divisible STAS steps` |
