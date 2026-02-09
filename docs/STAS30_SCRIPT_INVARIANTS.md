# STAS30 Script Invariants

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

## Notes

- Optional `null-data` output is message/service payload and does not affect STAS satoshi conservation.
- Funding input pays network fee and optional change.
- If a flow violates structural constraints, test should fail before script-level assertions.
