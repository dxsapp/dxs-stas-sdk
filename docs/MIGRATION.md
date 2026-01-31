# Migration to Uint8Array

## Breaking change

All binary inputs and outputs now use `Uint8Array` instead of `Buffer`.

## Common replacements

- `Buffer.from(hex, "hex")` → `fromHex(hex)`
- `Buffer.from(text, "utf8")` → `utf8ToBytes(text)`
- `buf.toString("hex")` → `toHex(buf)`
- `buf.toString("utf8")` → `bytesToUtf8(buf)`
- `Buffer.concat([...])` → `concat([...])`

## API renames

- `toBuffer()` → `toBytes()`
- `ScriptToken.fromBuffer()` → `ScriptToken.fromBytes()`
- `TransactionReader.readBuffer()` → `TransactionReader.readBytes()`
- `getNumberBuffer()` → `getNumberBytes()`

## Notes

- All public APIs now accept/return `Uint8Array`.
- If a dependency returns `Buffer`, treat it as `Uint8Array` and do not call `Buffer` methods on it.
