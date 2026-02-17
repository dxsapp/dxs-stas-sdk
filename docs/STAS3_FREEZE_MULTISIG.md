# DSTAS Locking Template (Freeze + Confiscation + Swap + Multisig)

This document summarizes the template behavior used by the SDK for Divisible STAS (DSTAS).

For transaction-level flow invariants, see `/Users/imighty/Code/dxs-stas-sdk/docs/DSTAS_SCRIPT_INVARIANTS.md`.

## Template Placeholders

The ASM template has variable placeholders:

- `<owner address/MPKH - 20 bytes>`
- `<2nd variable field>`
- `OP_RETURN <"redemption address"/"protocol ID" - 20 bytes> <flags field> <service data per each flag> <optional data field/s - upto around 4.2GB size>`

The SDK injects these fields in `src/script/build/stas3-freeze-multisig-builder.ts`.

## How Base Tokens Are Built

- Source of truth: `src/script/templates/stas3-freeze-multisig.ts`.
- Runtime base extraction: `src/script/templates/stas3-freeze-multisig-base.ts` parses the ASM once and caches the base token list.
- This keeps the SDK aligned with template updates without manual opcode-table regeneration.

## 2nd Variable Field (Action Data / Freeze Marker)

- Empty action field, not frozen: `OP_0`.
- Empty action field, frozen: `OP_2`.
- Non-empty action field, frozen: prefixed by byte `0x02`.
- Unfreeze removes the frozen marker (`OP_2` -> `OP_0` or strips `0x02` prefix).

## Flags and Service Fields

Flags are pushdata bytes (not numeric opcodes).

- Bit 0 (`0x01`): freezable
- Bit 1 (`0x02`): confiscatable
- Both enabled: `0x03`

Service fields must follow flags and are ordered left-to-right:

1. freeze authority field (if freezable)
2. confiscation authority field (if confiscatable)

The SDK enforces `serviceFields.length` to match enabled bits exactly.

## Spending Type (Unlocking Script)

- `0`: reserved
- `1`: regular spending
- `2`: freeze/unfreeze
- `3`: confiscation
- `4`: swap cancellation

## Behavior Notes

- Frozen UTXOs can still be confiscated (confiscation authority path supersedes freeze restriction).
- Redemption is not valid while token is in frozen/confiscation-restricted state.
- Issuer-side redeem path uses P2MPKH-compatible behavior in current SDK flows.

## Builder API

- `buildStas3FreezeMultisigTokens(params)`
- `buildStas3FreezeMultisigScript(params)`
- `buildStas3FreezeMultisigAsm(params)`

## Example

```ts
import { buildStas3FreezeMultisigScript, fromHex } from "dxs-stas-sdk";

const script = buildStas3FreezeMultisigScript({
  ownerPkh: fromHex("2f2ec98dfa6429a028536a6c9451f702daa3a333"),
  redemptionPkh: fromHex("b4ab0fffa02223a8a40d9e7f7823e61b38625382"),
  actionData: null,
  frozen: false,
  flags: new Uint8Array([0x03]), // freeze + confiscation
  serviceFields: [
    fromHex("00112233445566778899aabbccddeeff00112233"), // freeze authority
    fromHex("8899aabbccddeeff00112233445566778899aabb"), // confiscation authority
  ],
  optionalData: [],
});

console.log(script);
```
