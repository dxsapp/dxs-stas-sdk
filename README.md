# dxs-stas-sdk

TypeScript SDK for building and reading Bitcoin SV transactions, with first-class support for DSTAS/STAS token scripts. It includes script builders/readers, transaction builders/parsers, DSTAS and STAS factories, and address/key utilities.

## Binary types

All binary inputs/outputs are `Uint8Array` (no Node.js `Buffer` in the public API).

## Install

```bash
npm install dxs-stas-sdk
```

## Concepts

An `OutPoint` represents a spendable UTXO: txid, vout, locking script, satoshis, and owner address.

## Example: build a DSTAS issue + transfer flow

```ts
import {
  BuildDstasIssueTxs,
  BuildDstasTransferTx,
  OutPoint,
  PrivateKey,
  TokenScheme,
  TransactionReader,
  toHex,
  utf8ToBytes,
  fromHex,
} from "dxs-stas-sdk";

const bob = new PrivateKey(
  fromHex("b62fd57a07804f79291317261054eb9b19c9ccec49146c38b30a29d48636c368"),
);
const alice = new PrivateKey(
  fromHex("77b1b7d5bfe1288d94f829baba86d503e1a06b571aaa5d36820be19ef2fe520e"),
);

const scheme = new TokenScheme(
  "Divisible STAS",
  toHex(bob.Address.Hash160), // issuer token id
  "DSTAS",
  1,
  { isDivisible: true },
);

// Parse a funding transaction that belongs to issuer address (bob).
const sourceTx = TransactionReader.readHex("<funding-tx-hex>");
const fundingOut = OutPoint.fromTransaction(sourceTx, 0);

const { issueTxHex } = BuildDstasIssueTxs({
  fundingPayment: { OutPoint: fundingOut, Owner: bob },
  scheme,
  destinations: [{ Satoshis: 100, To: bob.Address }],
  feeRate: 0.1,
});

const issueTx = TransactionReader.readHex(issueTxHex);
const stasOut = OutPoint.fromTransaction(issueTx, 0);
const feeOut = OutPoint.fromTransaction(issueTx, 1);

const transferTxHex = BuildDstasTransferTx({
  stasPayment: { OutPoint: stasOut, Owner: bob },
  feePayment: { OutPoint: feeOut, Owner: bob },
  destination: { Satoshis: 100, To: alice.Address },
  Scheme: scheme,
  note: [utf8ToBytes("DSTAS"), utf8ToBytes("transfer")],
});
```

## Example: high-level DSTAS payouts with `DstasBundleFactory`

```ts
import {
  Address,
  DstasBundleFactory,
  DstasSpendType,
  LockingScriptReader,
  OutPoint,
  ScriptType,
  Transaction,
  Wallet,
  hash160,
  toHex,
  utf8ToBytes,
} from "dxs-stas-sdk";

const stasWallet =
  Wallet.fromMnemonic("<mnemonic>").deriveWallet("m/44'/236'/0'/0/0");
const feeWallet =
  Wallet.fromMnemonic("<mnemonic>").deriveWallet("m/44'/236'/0'/0/1");

// You provide these integrations from your indexer/wallet backend.
const getStasUtxoSet = async (minSats = 0): Promise<OutPoint[]> => {
  return await fetchDstasUtxosForAddress(stasWallet.Address, minSats);
};

const getFundingUtxo = async ({
  estimatedFeeSatoshis,
}: {
  utxoIdsToSpend: string[];
  estimatedFeeSatoshis: number;
  transactionsCount: number;
}): Promise<OutPoint> => {
  return await fetchFeeUtxoForAddress(feeWallet.Address, estimatedFeeSatoshis);
};

const getTransactions = async (
  ids: string[],
): Promise<Record<string, Transaction>> => {
  return await fetchTransactionsByIds(ids);
};

const mapSpendTypeToCode = (spendType: DstasSpendType): number => {
  if (spendType === "swap") return 4;
  if (spendType === "freeze" || spendType === "unfreeze") return 2;
  return 1;
};

const factory = new DstasBundleFactory(
  stasWallet,
  feeWallet,
  getFundingUtxo,
  getStasUtxoSet,
  getTransactions,
  ({ fromOutPoint, recipient, spendType, isFreezeLike, isChange }) => {
    const parsed = LockingScriptReader.read(fromOutPoint.LockignScript).Dstas;
    if (!parsed) throw new Error("Expected DSTAS input locking script");
    if (recipient.m !== 1 || recipient.addresses.length !== 1) {
      throw new Error("README example supports only m=1 recipient");
    }

    return {
      owner: recipient.addresses[0].Hash160,
      actionData:
        spendType === "swap" && !isChange ? parsed.ActionDataRaw : null,
      redemptionPkh: parsed.Redemption,
      frozen:
        spendType === "freeze"
          ? true
          : spendType === "unfreeze"
            ? false
            : isFreezeLike,
      flags: parsed.Flags,
      serviceFields: parsed.ServiceFields,
      optionalData: parsed.OptionalData,
    };
  },
  ({ txBuilder, inputIndex, spendType, isMerge }) => {
    const input = txBuilder.Inputs[inputIndex];
    input.Merge = isMerge;
    input.DstasSpendingType = mapSpendTypeToCode(spendType);
    input.sign(true);
    if (!input.UnlockingScript) {
      throw new Error("Failed to build DSTAS unlocking script");
    }
    return input.UnlockingScript;
  },
);

const recipients = [
  {
    recipient: { m: 1, addresses: [Address.fromBase58("<alice-address>")] },
    satoshis: 150,
  },
  {
    recipient: { m: 1, addresses: [Address.fromBase58("<bob-address>")] },
    satoshis: 200,
  },
];

const bundle = await factory.transfer({
  outputs: recipients,
  spendType: "transfer",
  note: [utf8ToBytes("DSTAS"), utf8ToBytes("bundle transfer")],
});

console.log("transactions:", bundle.transactions?.length ?? 0);
console.log("paid fee satoshis:", bundle.feeSatoshis);
```

Notes:

- `DstasBundleFactory` plans merge/split/transfer service transactions automatically.
- `note` is attached only to final transfer transaction(s), not to intermediate service transactions.
- For recipient multisig (`m > 1`), replace the simple `owner` derivation with your protocol-specific owner preimage/hash strategy.

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
  fromHex("b62fd57a07804f79291317261054eb9b19c9ccec49146c38b30a29d48636c368"),
);
const from = pk.Address;
const to = Address.fromBase58("1MkvWa82XHFqmRHaiRZ8BqZS7Uc83wekjp");
const lockingScript = fromHex(
  "76a914e3b111de8fec527b41f4189e313638075d96ccd688ac",
);

const utxo = new OutPoint(
  "11".repeat(32), // txid hex (little-endian when serialized)
  0, // vout
  lockingScript,
  10_000,
  from,
  ScriptType.p2pkh,
);

const txHex = TransactionBuilder.init()
  .addInput(utxo, pk)
  .addP2PkhOutput(1_000, to)
  .addChangeOutputWithFee(pk.Address, utxo.Satoshis - 1_000, 0.1)
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
  fromHex("b62fd57a07804f79291317261054eb9b19c9ccec49146c38b30a29d48636c368"),
);
const alice = new PrivateKey(
  fromHex("77b1b7d5bfe1288d94f829baba86d503e1a06b571aaa5d36820be19ef2fe520e"),
);

const tokenScheme = new TokenScheme(
  "Token Name",
  "e3b111de8fec527b41f4189e313638075d96ccd6",
  "TokenSymbol",
  1,
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
  fromHex("b62fd57a07804f79291317261054eb9b19c9ccec49146c38b30a29d48636c368"),
);
const issuerAddress = issuer.Address;

const tokenScheme = new TokenScheme(
  "Token Name",
  "e3b111de8fec527b41f4189e313638075d96ccd6",
  "Token Symbol",
  1,
);

// Parse a funding transaction with two outputs:
// 0) STAS input funding, 1) fee funding.
const sourceTx = TransactionReader.readHex("<source-tx-hex>");
const stasInput = OutPoint.fromTransaction(sourceTx, 0);
const feeInput = OutPoint.fromTransaction(sourceTx, 1);

const txHex = TransactionBuilder.init()
  .addInput(stasInput, issuer)
  .addInput(feeInput, issuer)
  .addStasOutputByScheme(tokenScheme, stasInput.Satoshis, issuerAddress)
  .addChangeOutputWithFee(feeInput.Address, feeInput.Satoshis, 0.05)
  .sign()
  .toHex();
```

## What this library is for

- Construct and parse raw Bitcoin SV transactions.
- Build and read scripts (P2PKH, OP_RETURN, DSTAS, STAS).
- Create DSTAS and STAS token transactions.
- Work with keys, addresses, and standard hashing helpers.

## FAQ / common pitfalls

- You typically need two inputs for STAS flows: one STAS UTXO and one fee-paying UTXO. (see: src/transaction-factory.ts:22-221)
- `OutPoint.TxId` is big-endian hex, but when serialized into a transaction it is reversed (little-endian). (see: src/transaction/build/input-builder.ts:123-130, src/transaction/read/transaction-reader.ts:24-33)
- Use `Uint8Array` everywhere; helpers are in `fromHex`, `toHex`, `utf8ToBytes`, and `bytesToUtf8`. (see: src/bytes.ts:1-38)
- `Address.fromBase58` only accepts mainnet prefixes. (see: src/bitcoin/address.ts:26-31)
- STAS script classification relies on known token templates; unknown scripts will classify as `unknown`. (see: src/bitcoin/transaction-output.ts:21-103, src/script/script-samples.ts:5-26)

## API overview (high level)

| Area                    | Purpose                              | Key exports                                                                                           |
| ----------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Bytes                   | Hex/UTF-8 helpers and byte utilities | `fromHex`, `toHex`, `utf8ToBytes`, `bytesToUtf8`, `concat`, `equal`                                   |
| Bitcoin primitives      | Keys, addresses, transactions        | `PrivateKey`, `Address`, `Transaction`, `OutPoint`                                                    |
| Script builders/readers | Build and parse scripts              | `ScriptBuilder`, `P2pkhBuilder`, `P2stasBuilder`, `NullDataBuilder`, `ScriptReader`                   |
| Transaction building    | Assemble raw txs                     | `TransactionBuilder`, `TransactionReader`                                                             |
| Token factories         | DSTAS/STAS workflows                 | `DstasBundleFactory`, `BuildDstasIssueTxs`, `BuildDstasTransferTx`, `BuildTransferTx`, `BuildSplitTx` |

## Author

- Author: [Oleg Panagushin](https://github.com/panagushin)  
  CTO / System Architect — Crypto & FinTech
