# Divisible STAS Script Invariants

This document captures the baseline protocol invariants used by SDK builders and tests.

## 0. Mint (Create Contract + Issue)

Mint is a two-step flow.

1. `CreateContract`:

- Inputs:
  `1 funding input`
- Outputs:
  `1 contract output` + `0..1 change output`
- Rule:
  Contract output locks the token scheme bytes and reserves satoshis to tokenize.

2. `Issue`:

- Inputs:
  `1 contract input` + `1 funding/change input`
- Outputs:
  `1..N STAS outputs` + `0..1 change output`
- Rule:
  `sum(issue STAS satoshis) == tokenized satoshis reserved in contract output`.

## 1. Transfer

- Inputs:
  `1 STAS input`, `1 funding input`
- Outputs:
  `1 STAS output`, `0..1 change output`, `0..1 null-data output`
- Rule:
  `STAS satoshis in == STAS satoshis out`.

## 2. Merge

- Inputs:
  `2 STAS inputs`, `1 funding input`
- Outputs:
  `1..2 STAS outputs` (current SDK scope), `0..1 change output`, `0..1 null-data output`
- Rule:
  `sum(STAS satoshis in) == sum(STAS satoshis out)`.

## 3. Split

- Inputs:
  `1 STAS input`, `1 funding input`
- Outputs:
  `1..4 STAS outputs`, `0..1 change output`, `0..1 null-data output`
- Rule:
  `sum(STAS satoshis in) == sum(STAS satoshis out)`.

## 4. Redeem

- Inputs:
  `1 STAS input` (issuer-only), `1 funding input`
- Outputs:
  `1 P2PKH redeem output`, `0..3 STAS outputs`, `0..1 change output`, `0..1 null-data output`
- Rules:
  `STAS input owner must be issuer (tokenId owner)`.
  `STAS satoshis in == redeem satoshis + sum(optional STAS outputs)`.
  Change output is excluded from STAS conservation.

## 5. Swap

Swap exchanges ownership across two independent assets.

- Inputs:
  `2 STAS inputs` + `1 funding input`
- Outputs:
  `2..4 STAS outputs` + `0..1 change output` + `0..1 null-data output`
- Base rule:
  Output #0 and #1 are swapped principal legs.
- Remainder rule:
  Output #2/#3 are optional remainders for leg-1 / leg-2.
- Conservation:
  Per-asset conservation must hold independently.
  `assetA in == assetA out`, `assetB in == assetB out`.
- Freeze rule:
  Frozen STAS inputs are not swappable.
- Second-field rule:
  Principal swap outputs use neutral action marker (`OP_FALSE`).
  Remainder outputs inherit second-field context from their origin leg.
- Requested-script-hash rule:
  For swap action-data, `requestedScriptHash` is computed as `SHA256(lockingScriptTail)`,
  where `lockingScriptTail` is all locking-script bytes starting immediately after the
  second variable field and up to the end of the locking script.
  This includes base template bytes, redemption field, flags, service fields, and optional data.

## 6. Confiscation

- Inputs:
  `1..N STAS inputs` (confiscation authority path), `1 funding input`
- Outputs:
  `1..N STAS outputs`, `0..1 change output`, `0..1 null-data output`
- Spending type:
  unlocking spending-type must be `3`.
- Rules:
  service fields after flags must include confiscation authority when confiscation bit is enabled.
  Frozen inputs can be confiscated.
  Output conservation per leg remains required (`sum(STAS in) == sum(STAS out)` for same asset leg).

## 7. OptionalData continuity

- If a DSTAS output was issued with `optionalData`, descendant DSTAS outputs that continue
  the same asset leg must preserve `optionalData` byte-exact.
- Removing or mutating `optionalData` in descendant outputs can make spend/merge validation fail.
- For swap flows, `optionalData` also participates indirectly through `requestedScriptHash`
  because it is part of the locking-script tail hash domain.

## 8. Owner / Authority multisig

- Authority multisig controls policy actions (freeze/unfreeze/confiscation).
- Owner multisig controls spending ownership path.
- These roles are independent and must not be conflated in tests or factories.

## 9. Flags/Service-Field coupling

- Flags are interpreted by bits (`0x01` freeze, `0x02` confiscation).
- Service fields are ordered by enabled policy:
  1. freeze authority
  2. confiscation authority
- Builder-level invariant:
  `serviceFields.length === enabledPolicyBitsCount`.

## Notes

- Optional `null-data` output is message/service payload and does not affect STAS satoshi conservation.
- Funding input pays network fee and optional change.
- If a flow violates structural constraints, test should fail before script-level assertions.
