# dxs-stas-sdk

TypeScript SDK for building and reading Bitcoin SV transactions, with first-class support for STAS token scripts. It includes script builders/readers, transaction builders/parsers, STAS issue/transfer/split/merge helpers, and address/key utilities.

## Binary types
All binary inputs/outputs are `Uint8Array` (no Node.js `Buffer` in the public API).

## Install
```bash
npm install dxs-stas-sdk
```

## Concepts
An `OutPoint` represents a spendable UTXO: txid, vout, locking script, satoshis, and owner address.

## Example: build a simple P2PKH transaction
```ts
import {
  Address,
  OutPoint,
  PrivateKey,
  ScriptType,
  TransactionBuilder,
  fromHex,
} from "dxs-stas-sdk";

const pk = new PrivateKey(
  fromHex("b62fd57a07804f79291317261054eb9b19c9ccec49146c38b30a29d48636c368")
);
const from = Address.fromBase58("1MkvWa82XHFqmRHaiRZ8BqZS7Uc83wekjp");
const lockingScript = fromHex(
  "76a914e3b111de8fec527b41f4189e313638075d96ccd688ac"
);

const utxo = new OutPoint(
  "11".repeat(32), // txid hex (little-endian when serialized)
  0,              // vout
  lockingScript,
  10_000,
  from,
  ScriptType.p2pkh
);

const txHex = TransactionBuilder.init()
  .addInput(utxo, pk)
  .addP2PkhOutput(1_000, from)
  .addChangeOutputWithFee(from, utxo.Satoshis - 1_000, 0.1)
  .sign()
  .toHex();
```

## Example: build a STAS transfer transaction
```ts
import {
  Address,
  OutPoint,
  PrivateKey,
  ScriptType,
  TokenScheme,
  BuildTransferTx,
  TransactionReader,
  fromHex,
  utf8ToBytes,
} from "dxs-stas-sdk";

const issuer = new PrivateKey(
  fromHex("b62fd57a07804f79291317261054eb9b19c9ccec49146c38b30a29d48636c368")
);
const alice = new PrivateKey(
  fromHex("77b1b7d5bfe1288d94f829baba86d503e1a06b571aaa5d36820be19ef2fe520e")
);

const tokenScheme = new TokenScheme(
  "Moi token",
  "e3b111de8fec527b41f4189e313638075d96ccd6",
  "MOI",
  1
);

// Parse a previous transaction that produced a STAS output + fee output.
const prevTx = TransactionReader.readHex("<issue-tx-hex>");
const stasOut = OutPoint.fromTransaction(prevTx, 0);
const feeOut = OutPoint.fromTransaction(prevTx, 1);

const txHex = BuildTransferTx({
  tokenScheme,
  stasPayment: { OutPoint: stasOut, Owner: alice },
  feePayment: { OutPoint: feeOut, Owner: issuer },
  to: Address.fromBase58("1C2dVLqv1kjNn7pztpQ51bpXVEJfoWUNxe"),
  note: [utf8ToBytes("DXS"), utf8ToBytes("Transfer test")],
});
```

## Example: build a STAS issue transaction
```ts
import {
  Address,
  OutPoint,
  PrivateKey,
  ScriptType,
  TokenScheme,
  TransactionBuilder,
  TransactionReader,
  fromHex,
} from "dxs-stas-sdk";

const issuer = new PrivateKey(
  fromHex("b62fd57a07804f79291317261054eb9b19c9ccec49146c38b30a29d48636c368")
);
const issuerAddress = issuer.Address;

const tokenScheme = new TokenScheme(
  "Moi token",
  "e3b111de8fec527b41f4189e313638075d96ccd6",
  "MOI",
  1
);

// Parse a funding transaction with two outputs:
// 0) STAS input funding, 1) fee funding.
const sourceTx = TransactionReader.readHex("<source-tx-hex>");
const stasInput = OutPoint.fromTransaction(sourceTx, 0);
const feeInput = OutPoint.fromTransaction(sourceTx, 1);

const txHex = TransactionBuilder.init()
  .addInput(stasInput, issuer)
  .addInput(feeInput, issuer)
  .addStasOutputByScheme(
    tokenScheme,
    stasInput.Satoshis,
    issuerAddress
  )
  .addChangeOutputWithFee(
    feeInput.Address,
    feeInput.Satoshis,
    0.05
  )
  .sign()
  .toHex();
```

## What this library is for
- Construct and parse raw Bitcoin SV transactions.
- Build and read scripts (P2PKH, OP_RETURN, STAS).
- Create STAS token transactions (issue, transfer, split, merge, redeem).
- Work with keys, addresses, and standard hashing helpers.

## FAQ / common pitfalls
- You typically need two inputs for STAS flows: one STAS UTXO and one fee-paying UTXO. (see: src/transaction-factory.ts:22-221)
- `OutPoint.TxId` is big-endian hex, but when serialized into a transaction it is reversed (little-endian). (see: src/transaction/build/input-builder.ts:123-130, src/transaction/read/transaction-reader.ts:24-33)
- Use `Uint8Array` everywhere; helpers are in `fromHex`, `toHex`, `utf8ToBytes`, and `bytesToUtf8`. (see: src/bytes.ts:1-38)
- `Address.fromBase58` only accepts mainnet prefixes. (see: src/bitcoin/address.ts:26-31)
- STAS script classification relies on known token templates; unknown scripts will classify as `unknown`. (see: src/bitcoin/transaction-output.ts:21-103, src/script/script-samples.ts:5-26)

## API overview (high level)
| Area | Purpose | Key exports |
| --- | --- | --- |
| Bytes | Hex/UTF-8 helpers and byte utilities | `fromHex`, `toHex`, `utf8ToBytes`, `bytesToUtf8`, `concat`, `equal` |
| Bitcoin primitives | Keys, addresses, transactions | `PrivateKey`, `Address`, `Transaction`, `OutPoint` |
| Script builders/readers | Build and parse scripts | `ScriptBuilder`, `P2pkhBuilder`, `P2stasBuilder`, `NullDataBuilder`, `ScriptReader` |
| Transaction building | Assemble raw txs | `TransactionBuilder`, `TransactionReader` |
| STAS factories | STAS workflows | `BuildTransferTx`, `BuildSplitTx`, `BuildMergeTx`, `BuildRedeemTx` |
