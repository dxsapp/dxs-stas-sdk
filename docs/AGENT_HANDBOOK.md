# Agent Handbook

Protocol invariants reference:

- Divisible STAS operation invariants are maintained in `docs/DSTAS_SCRIPT_INVARIANTS.md`.
- STAS3 freeze/multisig template notes are in `docs/STAS3_FREEZE_MULTISIG.md`.

## 1. Repository Snapshot

- The repository root includes `src`, `tests`, `dist`, `docs`, `index.ts`, `package.json`, `package-lock.json`, `tsconfig.json`, `jest.config.js`, `rollup.config.ts`, and `tslint.json`. (see: docs/COMMAND_LOG.md -> ls (after moving docs))
- Source code is organized under `src/bitcoin`, `src/buffer`, `src/script`, and `src/transaction`, with top-level modules like `src/transaction-factory.ts`, `src/dstas-factory.ts`, `src/stas-bundle-factory.ts`, `src/base.ts`, and `src/hashes.ts`. (see: docs/COMMAND_LOG.md -> Repo Tree (top-level + 2 depth))
- Tests live under `tests/` and include transaction, script, and script-eval coverage files. (see: docs/COMMAND_LOG.md -> ls (after moving docs))
- Build artifacts are emitted into `dist/` per the TypeScript outDir configuration. (see: tsconfig.json:52-59)

## 2. Environment & Tooling (TypeScript specifics)

- TypeScript is configured with `target: es2016`, `module: CommonJS`, and `moduleResolution: node`. (see: tsconfig.json:14-31)
- Compilation uses `rootDirs` of `./src` and `./tests` and includes `src` and `@types`. (see: tsconfig.json:36-39, tsconfig.json:109)
- Emission settings enable declarations, declaration maps, source maps, and output to `./dist`, with comments removed. (see: tsconfig.json:52-59)
- Type checking is `strict: true` with `esModuleInterop: true` and `skipLibCheck: true`. (see: tsconfig.json:80-85, tsconfig.json:107)
- `baseUrl` and `paths` are present only as commented examples, so no active path alias configuration exists in tsconfig. (see: tsconfig.json:30-35)
- `build` runs `tsc`, `test` runs `jest`, `start` uses `tsnd`, and `rollup` uses `rollup -c rollup.config.ts -w`. (see: package.json:11-16)
- Jest uses the `ts-jest` ESM preset with `tsconfig.jest.json` and matches tests under `/tests/` via `testRegex`. (see: jest.config.js:1-13, tsconfig.jest.json:1-13)
- Rollup is configured to bundle `src/index.ts` into `./dist/dxs.stas.sdk.js` as CJS with sourcemaps and uses commonjs/node-resolve/typescript plugins. (see: rollup.config.ts:1-25)
- TSLint extends `tslint:latest` and `tslint-config-prettier`. (see: tslint.json:1-3)
- ESLint config files are not present in the repo. (see: docs/COMMAND*LOG.md -> rg --files -g "\_eslint*")
- Prettier config files are not present in the repo. (see: docs/COMMAND*LOG.md -> rg --files -g "\_prettier*")
- Vitest and Mocha config files are not present in the repo. (see: docs/COMMAND*LOG.md -> rg --files -g "\_vitest*", docs/COMMAND*LOG.md -> rg --files -g "\_mocha*")

## 3. Quick Start (install/build/test)

- Package manager selection defaults to npm because `package-lock.json` is present. (see: docs/COMMAND_LOG.md -> ls (after moving docs))
- Node version in this environment is `v22.19.0`. (see: docs/COMMAND_LOG.md -> node -v)
- npm version in this environment is `10.9.3`. (see: docs/COMMAND_LOG.md -> npm -v)
- Install dependencies with `npm install` (completed successfully). (see: docs/COMMAND_LOG.md -> npm install)
- Build with `npm run build` (completed successfully). (see: docs/COMMAND_LOG.md -> npm run build)
- Run tests with `npm run test` (completed successfully). (see: docs/COMMAND_LOG.md -> npm run test)
- `npm run lint` is not available because no `lint` script exists. (see: package.json:11-16, docs/COMMAND_LOG.md -> npm run lint)
- `npm run typecheck` is not available because no `typecheck` script exists. (see: package.json:11-16, docs/COMMAND_LOG.md -> npm run typecheck)
- `npm pack` initially failed due to npm cache permission issues in `~/.npm`. (see: docs/COMMAND_LOG.md -> npm pack (failed))
- `npm pack --cache /tmp/npm-cache` succeeded and produced `dxs-stas-sdk-1.0.15.tgz`. (see: docs/COMMAND_LOG.md -> npm pack (with temp cache))

## 4. Public API (Exports & Entry Points)

- Package entry points are `main: dist/index.js` and `types: dist/index.d.ts` in `package.json`. (see: package.json:5-6)
- The root `index.ts` re-exports `./src`, which is the source entrypoint for public exports. (see: index.ts:1)
- `src/index.ts` re-exports the `bitcoin`, `buffer`, `bytes`, `binary`, `script`, `stas-bundle-factory`, `transaction`, `transaction-factory`, `dstas-factory`, `base`, and `hashes` modules. (see: src/index.ts:1-12)

Bitcoin exports:

- `Address` constructs a Base58Check P2PKH address from a 20-byte hash160 and exposes `Value`, `Hash160`, and `Network`. (see: src/bitcoin/address.ts:6-24)
- `Address.fromBase58`, `Address.fromPublicKey`, and `Address.fromHash160Hex` are the supported constructors; `fromBase58` only accepts Mainnet prefixes and throws on mismatch. (see: src/bitcoin/address.ts:26-41)
- `Network` is a type with `pubKeyHash` and `wif` and `Networks` currently defines only `Mainnet`. (see: src/bitcoin/network.ts:1-10)
- `OpCode` enumerates Bitcoin Script opcodes used across script builders/readers. (see: src/bitcoin/op-codes.ts:1-143)
- `ScriptType` defines script classifications including `p2pkh`, `nullData`, and `p2stas`. (see: src/bitcoin/script-type.ts:1-9)
- `SignatureHashType` enumerates standard Bitcoin sighash flags including `SIGHASH_ALL|FORKID`. (see: src/bitcoin/sig-hash-type.ts:1-7)
- `TokenScheme` encapsulates token metadata and serializes to JSON/bytes via `toJson` and `toBytes`. (see: src/bitcoin/token-scheme.ts:1-27)
- `TransactionInput` parses unlocking scripts and can attempt an address extraction via the last pubkey token. (see: src/bitcoin/transaction-input.ts:4-32)
- `TransactionOutput` decodes locking scripts into `ScriptType`, `Address`, `TokenId`, `Symbol`, and `data` fields. (see: src/bitcoin/transaction-output.ts:8-104)
- `Transaction` computes `Hex` and `Id` from raw bytes using double SHA256 and reverse endianness. (see: src/bitcoin/transaction.ts:6-30)
- `OutPoint` and `OutPointFull` model spendable outputs, with `OutPointFull` requiring `p2pkh` or `p2stas` outputs. (see: src/bitcoin/out-point.ts:6-60)
- `PrivateKey` derives compressed public keys, an `Address`, and provides `sign`/`verify` methods. (see: src/bitcoin/private-key.ts:22-39)
- `verifyBitcoinSignedMessage` verifies a compact signature over the standard Bitcoin Signed Message prefix. (see: src/bitcoin/private-key.ts:41-56)
- `Wallet` extends `HDKey`, can derive from mnemonic or path, and exposes `Address`, `PublicKey`, and `sign`. (see: src/bitcoin/wallet.ts:15-58)
- `Mnemonic` wraps BIP39 generation/validation helpers, with `generate`, `fromWords`, `fromPhrase`, and `fromRandomText`. (see: src/bitcoin/mnemonic.ts:8-39)
- `TPayment` and `TDestination` are the payment/destination data shapes used in transaction factories. (see: src/bitcoin/payment.ts:5-8, src/bitcoin/destination.ts:3-7)

Byte/crypto utilities:

- `ByteReader` and `ByteWriter` provide binary read/write helpers for Bitcoin-style varints and chunks (re-exported via `src/buffer`). (see: src/binary.ts:1-112, src/buffer/buffer-reader.ts:1, src/buffer/buffer-writer.ts:1)
- `buffer-utils` exports low-level helpers like `reverseBytes`, `splitBytes`, `getVarIntLength`, and `getNumberBytes`. (see: src/buffer/buffer-utils.ts:4-116)
- `hashes` exports `sha256`, `ripemd160`, `hash160`, and `hash256` helpers over `Uint8Array`. (see: src/hashes.ts:1-22)
- `bs58check` exposes Base58Check encoding/decoding using noble hashes. (see: src/base.ts:1-4)

Script building/reading:

- `ScriptBuilder` provides token-based script assembly with size accounting and byte serialization. (see: src/script/build/script-builder.ts:8-127)
- `P2pkhBuilder`, `P2stasBuilder`, and `NullDataBuilder` are specialized builders for P2PKH, STAS, and OP_RETURN scripts. (see: src/script/build/p2pkh-builder.ts:8-33, src/script/build/p2stas-builder.ts:8-37, src/script/build/null-data-builder.ts:7-20)
- `buildStas3FreezeMultisigTokens`, `buildStas3FreezeMultisigScript`, and `buildStas3FreezeMultisigAsm` build STAS 3.0 freeze+multisig scripts from structured params. (see: src/script/build/stas3-freeze-multisig-builder.ts:1-108)
- `buildUnlockingScript` assembles standard unlocking script layouts for tests and factory usage. (see: src/script/build/unlocking-script-builder.ts:1-118)
- `ScriptReader` parses script bytes into `ScriptToken[]` with minimal op encoding. (see: src/script/read/script-reader.ts:5-78)
- `ScriptToken` models opcodes and pushdata entries and can be created from raw bytes or sample tokens; STAS3-specific flags are carried in `IsSecondField`, `IsRedemptionId`, and `IsFlagsField`. (see: src/script/script-token.ts:4-91)
- `script-samples` provides sample token arrays including Divisible STAS helpers (`getP2Stas30Tokens`). (see: src/script/script-samples.ts:1-53)
- `isOpCode` checks whether a numeric value is a valid opcode boundary. (see: src/script/script-utils.ts:3-12)
- `ScriptEvaluator` executes scripts for tests with signature verification and optional OP_RETURN allowance. (see: src/script/eval/script-evaluator.ts:1-520)

Transaction building/reading:

- `TransactionBuilder` constructs Bitcoin transactions with inputs, outputs, signing, fee calculation, and serialization. (see: src/transaction/build/transaction-builder.ts:23-172)
- `InputBilder` (note the spelling) handles signing and unlocking script generation for P2PKH and P2STAS. (see: src/transaction/build/input-builder.ts:20-269)
- `OutputBuilder` serializes outputs with locking scripts and satoshis. (see: src/transaction/build/output-builder.ts:5-24)
- `TransactionReader` parses raw transactions into `Transaction`, `TransactionInput`, and `TransactionOutput` objects. (see: src/transaction/read/transaction-reader.ts:7-53)

High-level transaction factories:

- `BuildTransferTx`, `BuildSplitTx`, `BuildMergeTx`, and `BuildRedeemTx` are helpers that build specific STAS workflows over `TransactionBuilder`. (see: src/transaction-factory.ts:22-221)
- `FeeRate` is a constant used for transaction fee calculations in factory helpers. (see: src/transaction-factory.ts:12-13)
- The request types `TBuildTransferTxRequest`, `TBuildSplitTxRequest`, `TBuildMergeTxRequest`, and `TBuildRedeemTxRequest` describe factory inputs. (see: src/transaction-factory.ts:14-168)
- Divisible STAS flows are implemented in `BuildDstasBaseTx` and wrapper helpers (`BuildDstasTransferTx`, `BuildDstasSplitTx`, `BuildDstasMergeTx`, `BuildDstasFreezeTx`, `BuildDstasUnfreezeTx`, `BuildDstasSwapTx`, `BuildDstasMultisigTx`). (see: src/dstas-factory.ts:1-567)

Bundle factory:

- `StasBundleFactory` orchestrates multiple transfer/merge transactions to satisfy a payout amount and fee flow. (see: src/stas-bundle-factory.ts:40-374)
- `AvgFeeForMerge` and the bundle-related types (`TFundingUtxoRequest`, `TGetUtxoFunction`, `TGetFundingUtxoFunction`, `TGetTransactionsFunction`, `TStasPayoutBundle`) support external UTXO/transaction providers. (see: src/stas-bundle-factory.ts:19-38)

Minimal usage snippets:

- Bitcoin primitives example (Address/PrivateKey/Wallet) usage is based on the constructors and helpers in the bitcoin module. (see: src/bitcoin/address.ts:6-41, src/bitcoin/private-key.ts:22-39, src/bitcoin/wallet.ts:15-58)

```ts
import { Address, PrivateKey, Wallet, fromHex } from "dxs-stas-sdk";

const address = Address.fromBase58("1MkvWa82XHFqmRHaiRZ8BqZS7Uc83wekjp");
const key = new PrivateKey(fromHex("<32-byte-hex>"));
const wallet = Wallet.fromMnemonic("word1 word2 ...");
```

- Script building example usage follows the builder APIs. (see: src/script/build/p2pkh-builder.ts:8-33, src/script/build/p2stas-builder.ts:8-37, src/script/build/null-data-builder.ts:7-20)

```ts
import {
  Address,
  NullDataBuilder,
  P2pkhBuilder,
  P2stasBuilder,
  utf8ToBytes,
} from "dxs-stas-sdk";

const to = Address.fromBase58("1AoPwWXXk41vth2J9bHa6wMu65q4j89Q16");
const p2pkh = new P2pkhBuilder(to).toHex();
const nulldata = new NullDataBuilder([utf8ToBytes("note")]).toHex();
const stas = new P2stasBuilder(to, "<tokenIdHex>", "SYM").toHex();
```

- STAS 3.0 locking script example usage uses the token-based builder. (see: src/script/build/stas3-freeze-multisig-builder.ts:1-108)

```ts
import { buildStas3FreezeMultisigScript, fromHex } from "dxs-stas-sdk";

const stas3Script = buildStas3FreezeMultisigScript({
  ownerPkh: fromHex("<20-byte-owner-pkh>"),
  actionData: null,
  redemptionPkh: fromHex("<20-byte-redemption-pkh>"),
  frozen: false,
  flags: new Uint8Array([0x01]),
  serviceFields: [],
  optionalData: [],
});
```

- Transaction building example usage uses `TransactionBuilder` and friends. (see: src/transaction/build/transaction-builder.ts:23-172)

```ts
import { TransactionBuilder } from "dxs-stas-sdk";

const txHex = TransactionBuilder.init()
  .addInput(/* outPoint */, /* signer */)
  .addP2PkhOutput(1000, /* address */)
  .addChangeOutputWithFee(/* address */, /* change */, 0.05)
  .sign()
  .toHex();
```

- Transaction factory example usage uses the factory helpers. (see: src/transaction-factory.ts:22-221)

```ts
import { BuildTransferTx } from "dxs-stas-sdk";

const txHex = BuildTransferTx({
  tokenScheme,
  stasPayment,
  feePayment,
  to,
});
```

- Bundle factory example usage is based on `StasBundleFactory.createBundle`. (see: src/stas-bundle-factory.ts:40-116)

```ts
import { StasBundleFactory } from "dxs-stas-sdk";

const factory = new StasBundleFactory(
  tokenScheme,
  stasWallet,
  feeWallet,
  getFundingUtxo,
  getStasUtxoSet,
  getTransactions,
);
const bundle = await factory.createBundle(1000, {
  m: 1,
  addresses: [toAddress],
});
```

- Divisible STAS bundle factory uses a recipient object (M-of-N) and custom locking/unlocking builders. (see: src/dstas-bundle-factory.ts:1-736)

```ts
import { DstasBundleFactory } from "dxs-stas-sdk";

const dstasFactory = new DstasBundleFactory(
  stasWallet,
  feeWallet,
  getFundingUtxo,
  getStasUtxoSet,
  getTransactions,
  buildLockingParams,
  buildUnlockingScript,
);

const bundle30 = await dstasFactory.createBundle(
  1000,
  {
    m: 2,
    addresses: [addr1, addr2, addr3],
  },
  "transfer",
);
```

## 5. Module Map (What lives where)

- `src/bitcoin/*` holds address, key, transaction, script-type, and token scheme primitives used by builders and readers. (see: src/bitcoin/index.ts:1-15)
- `src/buffer/*` re-exports `ByteReader`/`ByteWriter` and contains varint/byte helpers used throughout transaction and script code. (see: src/buffer/index.ts:1-3, src/buffer/buffer-utils.ts:4-116)
- `src/script/*` implements script tokenization, parsing, Divisible STAS templates/builders, and script evaluation. (see: src/script/index.ts:1-13, src/script/build/script-builder.ts:8-127, src/script/eval/script-evaluator.ts:1-520)
- `src/script/templates/*` stores Divisible STAS template references, including the ASM template and precompiled base token list. (see: src/script/templates/stas3-freeze-multisig.ts:1-2, src/script/templates/stas3-freeze-multisig-base.ts:1-120)
- `src/transaction/*` implements transaction construction (`TransactionBuilder`) and parsing (`TransactionReader`). (see: src/transaction/index.ts:1-4, src/transaction/build/transaction-builder.ts:23-172)
- `src/transaction-factory.ts` provides high-level STAS v1 transaction helper functions (transfer/split/merge/redeem). (see: src/transaction-factory.ts:12-221)
- `src/dstas-factory.ts` provides Divisible STAS transaction helpers and semantic wrappers for freeze/unfreeze/swap/multisig flows. (see: src/dstas-factory.ts:1-567)
- `src/stas-bundle-factory.ts` provides multi-transaction bundling orchestration. (see: src/stas-bundle-factory.ts:40-374)
- `src/hashes.ts` and `src/base.ts` supply hashing and Base58Check utilities used by address and signature logic. (see: src/hashes.ts:5-13, src/base.ts:1-4)

## 6. Core Flows (Step-by-step)

Transfer (BuildTransferTx):

1. Initialize a `TransactionBuilder` and add STAS and fee inputs. (see: src/transaction-factory.ts:29-32, src/transaction/build/transaction-builder.ts:47-56)
2. Add a STAS output using the provided `TokenScheme` and destination address. (see: src/transaction-factory.ts:29-33, src/transaction/build/transaction-builder.ts:104-118)
3. Optionally append a null-data output if `note` is provided. (see: src/transaction-factory.ts:36-37, src/transaction/build/transaction-builder.ts:71-77)
4. Add change output with fee calculation, sign inputs, and serialize to hex. (see: src/transaction-factory.ts:38-46, src/transaction/build/transaction-builder.ts:79-172)
5. This flow is exercised in `tests/transaction-build.test.ts` for transfer cases. (see: tests/transaction-build.test.ts:106-133)

Split (BuildSplitTx):

1. Validate destination count (1-4) and require outputs to equal input satoshis. (see: src/transaction-factory.ts:64-72)
2. Build a transaction with STAS+fee inputs and multiple STAS outputs. (see: src/transaction-factory.ts:74-84)
3. Optionally add note output, then add change with fee, sign, and serialize. (see: src/transaction-factory.ts:85-97)
4. This flow is exercised in `tests/transaction-build.test.ts` for split cases. (see: tests/transaction-build.test.ts:135-188)

Merge (BuildMergeTx):

1. Validate both inputs belong to the same address and that output satoshis match inputs. (see: src/transaction-factory.ts:121-128)
2. Add two STAS merge inputs, a fee input, and one or two STAS outputs (split optional). (see: src/transaction-factory.ts:130-145)
3. Optionally add note output, then add change with fee, sign, and serialize. (see: src/transaction-factory.ts:147-159)
4. This flow is exercised in `tests/transaction-build.test.ts` for merge and merge-split cases. (see: tests/transaction-build.test.ts:152-268)

Redeem (BuildRedeemTx):

1. Derive the redeem address from `tokenScheme.TokenId` and verify the STAS input owner matches it. (see: src/transaction-factory.ts:177-180)
2. Validate split destination count (max 3) and compute redeem amount. (see: src/transaction-factory.ts:182-193)
3. Build a transaction with P2PKH redeem output plus optional split STAS outputs. (see: src/transaction-factory.ts:195-206)
4. Optionally add note output, then add change with fee, sign, and serialize. (see: src/transaction-factory.ts:208-220)

Divisible STAS Base (BuildDstasBaseTx):

1. Validate at least one STAS input and destination; enforce exact satoshi conservation across STAS inputs/outputs. (see: src/dstas-factory.ts:52-76)
2. Add STAS inputs, fee input, and build locking scripts via `buildStas3FreezeMultisigScript`. (see: src/dstas-factory.ts:78-107)
3. Optionally add null-data outputs, then add change output with fee, inject unlocking scripts for STAS inputs, sign, and serialize. (see: src/dstas-factory.ts:109-139)

Transaction signing (InputBilder.sign):

1. Compute the preimage using `SIGHASH_ALL | FORKID` and hash it with `hash256`. (see: src/transaction/build/input-builder.ts:46-56, src/transaction/build/transaction-builder.ts:25-27)
2. For P2PKH, build unlocking script with DER signature + pubkey as two var-chunks. (see: src/transaction/build/input-builder.ts:58-68)
3. For P2STAS, build a custom unlocking script including outputs, funding input references, merge info, preimage, and signature. (see: src/transaction/build/input-builder.ts:69-114)

Transaction parsing (TransactionReader.readHex):

1. Decode version, inputs, outputs, and locktime from the raw bytes. (see: src/transaction/read/transaction-reader.ts:11-31)
2. Build `TransactionInput` and `TransactionOutput` objects as part of the parsed `Transaction`. (see: src/transaction/read/transaction-reader.ts:34-53)
3. Output classification (`p2pkh`, `nullData`, `p2stas`) occurs inside `TransactionOutput` parsing. (see: src/bitcoin/transaction-output.ts:8-104)
4. This flow is exercised in `tests/transaction-reader.test.ts`. (see: tests/transaction-reader.test.ts:5-49)

Bundle creation (StasBundleFactory.createBundle):

1. Fetch and sort STAS UTXOs, then validate balance for the requested amount. (see: src/stas-bundle-factory.ts:55-65)
2. Select UTXOs, estimate fee via a dry-run bundle, and request a funding UTXO. (see: src/stas-bundle-factory.ts:66-97)
3. Build merge and transfer/split transactions in `_createBundle`, returning transactions and fee. (see: src/stas-bundle-factory.ts:118-160)
4. Merge logic iteratively merges or transfers based on level count and creates fee payment outputs. (see: src/stas-bundle-factory.ts:219-338)

## 7. Invariants & Gotchas

- `Address` only supports mainnet P2PKH and throws if `hash160` is not 20 bytes or if a Base58 prefix is not mainnet. (see: src/bitcoin/address.ts:11-31)
- `Networks` only defines `Mainnet`, so testnet prefixes are not supported in this module. (see: src/bitcoin/network.ts:6-10)
- `OutPointFull` only accepts outputs of `ScriptType.p2pkh` or `ScriptType.p2stas` and throws otherwise. (see: src/bitcoin/out-point.ts:40-49)
- `InputBilder.preimage` supports `SIGHASH_ALL`, `SIGHASH_SINGLE`, `SIGHASH_NONE` and `SIGHASH_ANYONECANPAY` variants with `FORKID`. (see: src/transaction/build/input-builder.ts:188-231)
- `BuildSplitTx` enforces destination count (1-4) and exact satoshi conservation. (see: src/transaction-factory.ts:64-72)
- `BuildMergeTx` requires both inputs to share an address and checks satoshi conservation. (see: src/transaction-factory.ts:121-128)
- `BuildRedeemTx` requires the redeem address to equal `tokenScheme.TokenId`, enforces max 3 split destinations, and requires `redeemAmount > 0`. (see: src/transaction-factory.ts:177-193)
- `TransactionBuilder.addChangeOutputWithFee` throws `TransactionBuilderError` when fee exceeds or equals the change amount. (see: src/transaction/build/transaction-builder.ts:91-98)
- `TransactionOutput` script classification relies on sample tokens from `script-samples`, so misaligned scripts may classify as `unknown`. (see: src/bitcoin/transaction-output.ts:21-103, src/script/script-samples.ts:5-26)

## 8. Testing Guide (How to run / how to add tests)

- Tests are run via `npm run test` using Jest + `ts-jest` ESM preset in the `node` environment. (see: package.json:11-13, jest.config.js:1-13)
- Jest discovers tests under `/tests/` matching `*.test.ts` or `*.spec.ts` by regex. (see: jest.config.js:4)
- Current test files include transaction/script build/read suites plus bytes utilities, script round-trips, transaction round-trips, private key signing, and address/outpoint coverage. (see: tests/transaction-build.test.ts:1-10, tests/script-build.test.ts:1-10, tests/transaction-reader.test.ts:1-10, tests/script-read.test.ts:1-10, tests/bytes-utils.test.ts:1-10, tests/script-roundtrip.test.ts:1-10, tests/transaction-roundtrip.test.ts:1-10, tests/private-key.test.ts:1-10, tests/address-outpoint.test.ts:1-10)
- There is no `npm run lint` or `npm run typecheck` script configured. (see: package.json:11-16, docs/COMMAND_LOG.md -> npm run lint, docs/COMMAND_LOG.md -> npm run typecheck)

## 9. Contribution Playbook (How to implement changes safely)

- Add new public exports by updating `src/index.ts` and, if needed, the relevant module index (e.g., `src/bitcoin/index.ts`). (see: src/index.ts:1-8, src/bitcoin/index.ts:1-15)
- New Bitcoin or script primitives should live in `src/bitcoin` or `src/script` to match the existing module split. (see: docs/COMMAND_LOG.md -> Repo Tree (top-level + 2 depth))
- Transaction logic changes should be placed in `src/transaction` and surfaced through `src/transaction/index.ts`. (see: src/transaction/index.ts:1-4)
- Add tests under `tests/` and ensure they match the Jest regex used in `jest.config.js`. (see: jest.config.js:4, docs/COMMAND_LOG.md -> ls (after moving docs))
- Style guidance is limited to TSLint configuration; no ESLint/Prettier configs are present. (see: tslint.json:1-3, docs/COMMAND*LOG.md -> rg --files -g "\_eslint*", docs/COMMAND*LOG.md -> rg --files -g "\_prettier*")
- Release/publish automation is not defined in package scripts. (see: package.json:11-16)

## 10. PR Review Checklist

- Verify any transaction signing changes preserve `DefaultSighashType` behavior. (see: src/transaction/build/transaction-builder.ts:25-27)
- Confirm P2STAS unlocking script structure is preserved when modifying input signing. (see: src/transaction/build/input-builder.ts:69-114)
- Ensure address-related changes maintain mainnet-only constraints or intentionally expand `Networks`. (see: src/bitcoin/address.ts:26-31, src/bitcoin/network.ts:6-10)
- Check that satoshi conservation constraints in split/merge/redeem flows remain enforced. (see: src/transaction-factory.ts:64-128, src/transaction-factory.ts:185-193)
- Verify script classification logic remains consistent with `script-samples` when modifying script parsing. (see: src/bitcoin/transaction-output.ts:21-103, src/script/script-samples.ts:5-26)

## 11. Command Results (Summary + links to COMMAND_LOG sections)

- `node -v` succeeded. (see: docs/COMMAND_LOG.md -> node -v)
- `npm -v` succeeded. (see: docs/COMMAND_LOG.md -> npm -v)
- `npm install` succeeded. (see: docs/COMMAND_LOG.md -> npm install)
- `npm run build` succeeded. (see: docs/COMMAND_LOG.md -> npm run build)
- `npm run test` succeeded. (see: docs/COMMAND_LOG.md -> npm run test)
- `npm run lint` was skipped because the script is not present. (see: docs/COMMAND_LOG.md -> npm run lint)
- `npm run typecheck` was skipped because the script is not present. (see: docs/COMMAND_LOG.md -> npm run typecheck)
- `npm pack` failed due to npm cache permissions. (see: docs/COMMAND_LOG.md -> npm pack (failed))
- `npm pack --cache /tmp/npm-cache` succeeded. (see: docs/COMMAND_LOG.md -> npm pack (with temp cache))

## 12. Open Questions / Missing Pieces

- Release/publish instructions are not present in the repo (no scripts or docs found). (see: package.json:11-16, docs/COMMAND_LOG.md -> Repo Tree (top-level + 2 depth))
- Linting scripts are not present in `package.json`. (see: package.json:11-16)
- Typecheck scripts are not present in `package.json`. (see: package.json:11-16)
- ESLint configuration files are not present in the repo. (see: docs/COMMAND*LOG.md -> rg --files -g "\_eslint*")
- Prettier configuration files are not present in the repo. (see: docs/COMMAND*LOG.md -> rg --files -g "\_prettier*")
- Vitest/Mocha configurations are not present in the repo. (see: docs/COMMAND*LOG.md -> rg --files -g "\_vitest*", docs/COMMAND*LOG.md -> rg --files -g "\_mocha*")
