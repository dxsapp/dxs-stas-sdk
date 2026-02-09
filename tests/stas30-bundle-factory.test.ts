import {
  Stas30BundleFactory,
  TStas30Recipient,
  TStas30UnlockingScriptBuilder,
} from "../src/stas30-bundle-factory";
import { Wallet } from "../src/bitcoin/wallet";
import { P2pkhBuilder } from "../src/script/build/p2pkh-builder";
import { OutPoint } from "../src/bitcoin/out-point";
import { ScriptType } from "../src/bitcoin/script-type";
import { Address } from "../src/bitcoin/address";
import { fromHex } from "../src/bytes";
import { buildStas3Flags } from "../src/script/build/stas3-freeze-multisig-builder";

const mnemonic =
  "group spy extend supreme monkey judge avocado cancel exit educate modify bubble";

const ownerPkh = fromHex("2f2ec98dfa6429a028536a6c9451f702daa3a333");
const redemptionPkh = fromHex("b4ab0fffa02223a8a40d9e7f7823e61b38625382");

type TestFactory = {
  factory: Stas30BundleFactory;
  buildUnlockingScript: SpyFn<[UnlockingArgs], Uint8Array>;
  recipient: TStas30Recipient;
};

type UnlockingArgs = Parameters<TStas30UnlockingScriptBuilder>[0];
type SpyFn<Args extends unknown[], Ret> = ((...args: Args) => Ret) & {
  calls: Args[];
};

const createSpy = <Args extends unknown[], Ret>(
  impl: (...args: Args) => Ret,
): SpyFn<Args, Ret> => {
  const calls: Args[] = [];
  const fn = ((...args: Args) => {
    calls.push(args);
    return impl(...args);
  }) as SpyFn<Args, Ret>;
  fn.calls = calls;
  return fn;
};

const makeOutPoint = (
  txId: string,
  satoshis: number,
  address: Address,
  scriptType: ScriptType,
  scriptBytes: Uint8Array,
) => new OutPoint(txId, 0, scriptBytes, satoshis, address, scriptType);

const makeFactory = (stasSatoshis = 1000): TestFactory => {
  const stasWallet =
    Wallet.fromMnemonic(mnemonic).deriveWallet("m/44'/236'/0'/0/0");
  const feeWallet =
    Wallet.fromMnemonic(mnemonic).deriveWallet("m/44'/236'/0'/0/1");

  const stasOutPoint = makeOutPoint(
    "00".repeat(32),
    stasSatoshis,
    stasWallet.Address,
    ScriptType.unknown,
    new Uint8Array([0x51]),
  );

  const feeScript = new P2pkhBuilder(feeWallet.Address).toBytes();
  const feeOutPoint = makeOutPoint(
    "11".repeat(32),
    100000,
    feeWallet.Address,
    ScriptType.p2pkh,
    feeScript,
  );

  const getStasUtxoSet = createSpy(async () => [stasOutPoint]);
  const getFundingUtxo = createSpy(async () => feeOutPoint);
  const getTransactions = createSpy(async () => ({}));

  const buildLockingParams = createSpy(() => ({
    ownerPkh,
    secondField: null,
    redemptionPkh,
    frozen: false,
    flags: buildStas3Flags({ freezable: true }),
    serviceFields: [],
    optionalData: [],
  }));

  const buildUnlockingScript = createSpy(
    (_args: UnlockingArgs) => new Uint8Array(),
  );

  const factory = new Stas30BundleFactory(
    stasWallet,
    feeWallet,
    getFundingUtxo,
    getStasUtxoSet,
    getTransactions,
    buildLockingParams,
    buildUnlockingScript,
  );

  const recipient: TStas30Recipient = {
    m: 1,
    addresses: [stasWallet.Address],
  };

  return { factory, buildUnlockingScript, recipient };
};

describe("Stas30BundleFactory spendType flags", () => {
  test("freeze/unfreeze set isFreezeLike=true", async () => {
    const { factory, buildUnlockingScript, recipient } = makeFactory(1000);

    await factory.createFreezeBundle(1000, recipient);
    await factory.createUnfreezeBundle(1000, recipient);

    const calls = buildUnlockingScript.calls.map(
      (call) => call[0] as UnlockingArgs,
    );
    const freezeCalls = calls.filter(
      (c: UnlockingArgs) => c.spendType === "freeze",
    );
    const unfreezeCalls = calls.filter(
      (c: UnlockingArgs) => c.spendType === "unfreeze",
    );

    expect(freezeCalls.length).toBeGreaterThan(0);
    expect(unfreezeCalls.length).toBeGreaterThan(0);

    for (const call of freezeCalls) {
      expect(call.isFreezeLike).toBe(true);
    }
    for (const call of unfreezeCalls) {
      expect(call.isFreezeLike).toBe(true);
    }
  });

  test("transfer/swap set isFreezeLike=false", async () => {
    const { factory, buildUnlockingScript, recipient } = makeFactory(1000);

    await factory.createTransferBundle(1000, recipient);
    await factory.createSwapBundle(1000, recipient);

    const calls = buildUnlockingScript.calls.map(
      (call) => call[0] as UnlockingArgs,
    );
    const transferCalls = calls.filter(
      (c: UnlockingArgs) => c.spendType === "transfer",
    );
    const swapCalls = calls.filter(
      (c: UnlockingArgs) => c.spendType === "swap",
    );

    expect(transferCalls.length).toBeGreaterThan(0);
    expect(swapCalls.length).toBeGreaterThan(0);

    for (const call of transferCalls) {
      expect(call.isFreezeLike).toBe(false);
    }
    for (const call of swapCalls) {
      expect(call.isFreezeLike).toBe(false);
    }
  });
});
