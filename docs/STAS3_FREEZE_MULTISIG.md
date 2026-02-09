# STAS 3.0 Freeze + Multisig (Template Notes)

This document summarizes the freezability rules and how the SDK builds the STAS 3.0 "freeze + multisig" locking script template.

For operation-level transaction structure invariants (mint/transfer/merge/split/redeem), see `docs/STAS30_SCRIPT_INVARIANTS.md`.

## Fields in the Template

The template contains placeholders in ASM:

- `<owner address/MPKH - 20 bytes>`
- `<2nd variable field>`
- `OP_RETURN <"redemption address"/"protocol ID" - 20 bytes> <flags field> <service data per each flag> <optional data field/s - upto around 4.2GB size>`

These are replaced by the builder in `src/script/build/stas3-freeze-multisig-builder.ts`.

Internally, the SDK does **not** assemble this script via ASM; it uses a precompiled token list stored in `src/script/templates/stas3-freeze-multisig-base.ts` and inserts the variable fields at runtime. The ASM template in `src/script/templates/stas3-freeze-multisig.ts` remains available for inspection.

## Freezing / Unfreezing Rules (2nd Variable Field)

- **Frozen marker** is:
  - `OP_2` (`0x52`) if the 2nd field was empty when frozen.
  - Otherwise a non-empty string **prefixed by `0x02`**.
- **Unfreeze**:
  - `OP_2` becomes empty string (`OP_0`).
  - Or remove `0x02` prefix from the non-empty string.

Minimal encoding is required for the 2nd field:

- If the original 2nd field was `OP_1` or `OP_3..OP_16` or `OP_1NEGATE`, freezing uses `0x02` + the pushed value (e.g. `OP_16` -> `0x0210`).
- For an empty string, freezing with `0x02` must NOT work; only `OP_2` is valid.

## Flags Field

- Flags field is **always present**, unless no data follows it.
- To denote "no flags":
  - Use empty string (`OP_0`) or
  - Use a push of `00` (i.e. `0x0100`).
- Flags byte length: recommended **1-75 bytes** for higher-level tooling, but script allows up to 255.
- **Do not use OP_1..OP_16** to encode flags. Use pushdata bytes instead.
- The **lowest bit** of flags marks "freezable".
- **Service fields** follow the flags field, ordered **right-to-left** by flag bit positions.

## Spending-Type Parameter

Spending-type is always present in the unlocking script:

- `0` reserved
- `1` regular spending
- `2` freeze/unfreeze
- `3` confiscation
- `4` swap cancellation

## Signature Bypass (per template author)

To skip signature verification:

1. Put empty string as preimage (`OP_0`) in unlocking script.
2. Omit signature placeholder.
3. Set PKH in locking script to `HASH160("")` = `b472a266d0bd89c13706a4132ccfb16f7c3b9fcb`.

## Builder API

The SDK exposes:

- `buildStas3FreezeMultisigTokens(params)` -> `ScriptToken[]`
- `buildStas3FreezeMultisigScript(params)` -> `Uint8Array`
- `buildStas3FreezeMultisigAsm(params)` -> `string` (inspection only; uses tokens under the hood)

See `src/script/build/stas3-freeze-multisig-builder.ts`.

### Example

```ts
import { buildStas3FreezeMultisigScript, fromHex } from "dxs-stas-sdk";

const ownerPkh = fromHex("2f2ec98dfa6429a028536a6c9451f702daa3a333");
const redemptionPkh = fromHex("b4ab0fffa02223a8a40d9e7f7823e61b38625382");

// Example: frozen token with freezable flag set, and one service field (freeze authority)
const script = buildStas3FreezeMultisigScript({
  ownerPkh,
  redemptionPkh,
  secondField: null, // empty
  frozen: true, // uses OP_2 in template
  flags: new Uint8Array([0x01]), // freezable bit
  serviceFields: [fromHex("00112233445566778899aabbccddeeff00112233")],
  optionalData: [],
});

console.log(script);
```
