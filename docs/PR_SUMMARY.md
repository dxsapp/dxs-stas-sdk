Summary
- Migrated all binary handling to `Uint8Array` with new `src/bytes.ts` and `src/binary.ts` utilities.
- Removed all `Buffer` usage and renamed Buffer-oriented APIs (e.g., `toBytes`, `fromBytes`, `readBytes`).
- Updated tests and Jest configuration to run with ESM deps and added a no-Buffer enforcement script.
- Moved markdown documentation into `docs/`.

Key files
- `src/bytes.ts`, `src/binary.ts`
- `src/buffer/buffer-utils.ts`
- `src/bitcoin/*`, `src/script/*`, `src/transaction/*`
- `tests/*.test.ts`
- `jest.config.js`, `tsconfig.jest.json`, `scripts/check-no-buffer.mjs`, `package.json`
- `docs/README.md`, `docs/MIGRATION.md`

Migration notes
- All binary inputs/outputs are `Uint8Array`.
- Renamed APIs: `toBuffer()` → `toBytes()`, `ScriptToken.fromBuffer()` → `fromBytes()`, `TransactionReader.readBuffer()` → `readBytes()`, `getNumberBuffer()` → `getNumberBytes()`.

Commands
- `npm run build` — ok
- `npm test` — ok
- `npm run check:nobuffer` — ok
- `rg -n "Buffer\b|from\(\"buffer\"\)|import\s+\{\s*Buffer\s*\}" src` — no matches
