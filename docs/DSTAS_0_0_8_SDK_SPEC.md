# DSTAS 0.0.8 SDK Specification (Normative)

This document defines the protocol behavior implemented and enforced by this SDK for Divisible STAS (`ScriptType.dstas`).

It is the SDK source of truth when upstream notes are partial or ambiguous.

## 1. Locking Script Structure

The DSTAS locking script is interpreted as:

1. `owner` variable field (`PKH` or `MPKH` preimage payload).
2. `actionData` variable field (second variable field).
3. static DSTAS template body.
4. `redemption` variable field.
5. `flags` variable field (always pushdata in SDK builders).
6. `serviceFields[]` (order is fixed by enabled policy bits).
7. `optionalData[]` tail.

## 2. Flags and Service Fields

Flags are interpreted as bitfield (least significant bit first):

- bit `0x01`: freeze enabled
- bit `0x02`: confiscation enabled

Service fields are serialized left-to-right in this exact order:

1. freeze authority
2. confiscation authority

If a bit is disabled, its service field is absent.
If no bits are enabled, `serviceFields` is empty.

## 3. Spending Type (Unlocking)

The SDK uses these spending-type values:

- `1`: regular spend
- `2`: freeze/unfreeze authority path
- `3`: confiscation authority path
- `4`: swap cancellation

`0` is reserved and not emitted by SDK builders.

## 4. Action Data Semantics

### 4.1 Neutral Action Data

Neutral action marker is `OP_FALSE` (`00` pushdata value).

### 4.2 Swap Action Data

Swap action-data carries:

- `requestedScriptHash` (32 bytes)
- `requestedPkh` (20 bytes)
- `rateNumerator`
- `rateDenominator`

#### requestedScriptHash domain

`requestedScriptHash` is `SHA256(lockingScriptTail)`, where `lockingScriptTail` starts immediately after `actionData` and continues to the end of locking script.

This includes:

- template body
- redemption
- flags
- service fields
- optional data

## 5. Policy Layering

Policy control is monotonic:

- swap-marked UTXO can be frozen
- frozen UTXO can be confiscated

Therefore confiscation path is valid for frozen UTXOs.

## 6. Redeem Constraints

- redeem is issuer-only (issuer identity is tokenId owner)
- redeem must use regular spend semantics, not confiscation mode
- frozen UTXO cannot be redeemed
- redemption cannot be combined with freeze/confiscation spending mode in one spend path

## 7. Optional Data Continuity

If a token leg has `optionalData`, descendant outputs that continue the leg must preserve that payload byte-exact.

In swap flows this also affects `requestedScriptHash`, because optional data is inside the hashed locking-script tail.

## 8. Multisig Support

- owner can be `MPKH` (owner multisig spend path)
- authority can be `MPKH` (freeze/confiscation authority path)
- owner and authority roles are independent

## 9. SDK Boundaries

This document covers script-level and builder-level behavior in SDK tests/evaluator.
Mempool policy, miner policy, and indexer side-effects are out of scope.

## 10. SDK Cryptographic Policy

- ECDSA signatures are produced through `@noble/secp256k1` with deterministic signing behavior and `lowS` normalization enabled.
- Private keys can be explicitly zeroized through `PrivateKey.dispose()` (best-effort memory hygiene in JS runtime constraints).
