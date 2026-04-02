import { jest } from "@jest/globals";
import { Address } from "../src/bitcoin/address";
import { OutPoint } from "../src/bitcoin/out-point";
import { ScriptType } from "../src/bitcoin/script-type";
import { TokenScheme } from "../src/bitcoin/token-scheme";
import { Transaction } from "../src/bitcoin/transaction";
import { Wallet } from "../src/bitcoin/wallet";
import { StasBundleFactory } from "../src/stas-bundle-factory";
import { P2pkhBuilder } from "../src/script/build/p2pkh-builder";

const mnemonicA = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const mnemonicB = "legal winner thank year wave sausage worth useful legal winner thank yellow";
const recipient = Address.fromBase58("1C2dVLqv1kjNn7pztpQ51bpXVEJfoWUNxe");

const makeOutPoint = (
  wallet: Wallet,
  satoshis: number,
  txId: string,
  vout: number,
) =>
  new OutPoint(
    txId,
    vout,
    new P2pkhBuilder(wallet.Address).toBytes(),
    satoshis,
    wallet.Address,
    ScriptType.p2pkh,
  );

const createFactory = (overrides?: {
  getFundingUtxo?: jest.Mock;
  getStasUtxoSet?: jest.Mock;
  getTransactions?: jest.Mock;
}) => {
  const stasWallet = Wallet.fromMnemonic(mnemonicA);
  const feeWallet = Wallet.fromMnemonic(mnemonicB);
  const getFundingUtxo: any =
    overrides?.getFundingUtxo ??
    jest.fn(async () => makeOutPoint(feeWallet, 1_000, "ff".repeat(32), 0));
  const getStasUtxoSet: any =
    overrides?.getStasUtxoSet ?? jest.fn(async () => [] as OutPoint[]);
  const getTransactions: any = overrides?.getTransactions ?? jest.fn(async () => ({}));

  return {
    stasWallet,
    feeWallet,
    getFundingUtxo,
    getStasUtxoSet,
    getTransactions,
    factory: new StasBundleFactory(
      new TokenScheme("Test", "11".repeat(20), "TST", 1),
      stasWallet,
      feeWallet,
      getFundingUtxo,
      getStasUtxoSet,
      getTransactions,
    ),
  };
};

describe("stas bundle factory", () => {
  test("returns insufficient balance message when available stas is too low", async () => {
    const { factory, stasWallet } = createFactory({
      getStasUtxoSet: jest.fn(async () => [
        makeOutPoint(stasWallet, 10, "aa".repeat(32), 0),
        makeOutPoint(stasWallet, 20, "bb".repeat(32), 0),
      ]),
    });

    await expect(factory.createBundle(100, recipient)).resolves.toEqual({
      message: "Insufficient STAS tokens balance",
      feeSatoshis: 0,
    });
  });

  test("selects exact or accumulated stas utxos", () => {
    const { factory, stasWallet } = createFactory();
    const utxos = [
      makeOutPoint(stasWallet, 20, "aa".repeat(32), 0),
      makeOutPoint(stasWallet, 30, "bb".repeat(32), 0),
      makeOutPoint(stasWallet, 70, "cc".repeat(32), 0),
    ];

    expect((factory as any).getStasUtxo(utxos, 70)).toHaveLength(1);
    expect((factory as any).getStasUtxo(utxos, 45).map((x: OutPoint) => x.Satoshis)).toEqual([20, 30]);
  });

  test("requests funding utxo with adjusted estimated fee and returns final bundle", async () => {
    const { factory, stasWallet, feeWallet, getFundingUtxo } = createFactory({
      getStasUtxoSet: jest.fn(async () => [
        makeOutPoint(stasWallet, 40, "aa".repeat(32), 0),
        makeOutPoint(stasWallet, 30, "bb".repeat(32), 0),
      ]),
    });
    const probeResult = { feeSatoshis: 100, transactions: ["m1", "m2"] };
    const finalResult = { feeSatoshis: 111, transactions: ["done"] };
    const funding = makeOutPoint(feeWallet, 900, "ff".repeat(32), 1);
    (getFundingUtxo as any).mockResolvedValue(funding);

    jest
      .spyOn(factory as any, "_createBundle")
      .mockResolvedValueOnce(probeResult)
      .mockResolvedValueOnce(finalResult);

    await expect(factory.createBundle(60, recipient)).resolves.toEqual(finalResult);
    expect(getFundingUtxo).toHaveBeenCalledWith({
      utxoIdsToSpend: ["bb".repeat(32) + ":0", "aa".repeat(32) + ":0"],
      estimatedFeeSatoshis: 120,
      transactionsCount: 2,
    });
  });

  test("buildFeeTransaction returns single fee utxo unchanged", () => {
    const { factory, feeWallet } = createFactory();
    const utxo = makeOutPoint(feeWallet, 500, "ff".repeat(32), 0);

    expect((factory as any).buildFeeTransaction([utxo], 100)).toEqual({
      feeUtxo: utxo,
    });
  });

  test("mergeStasTransactions returns original utxo when no merge is needed", async () => {
    const { factory, stasWallet, feeWallet } = createFactory();
    const stasUtxo = makeOutPoint(stasWallet, 50, "aa".repeat(32), 0);
    const feeUtxo = makeOutPoint(feeWallet, 500, "ff".repeat(32), 0);

    await expect(
      (factory as any).mergeStasTransactions([stasUtxo], 50, feeUtxo),
    ).resolves.toEqual({
      mergeFeeUtxo: feeUtxo,
      stasUtxo,
    });
  });

  test("mergeStasTransactions fails when a source transaction is missing", async () => {
    const { factory, stasWallet, feeWallet } = createFactory({
      getTransactions: jest.fn(async () => ({} as Record<string, Transaction>)),
    });
    const feeUtxo = makeOutPoint(feeWallet, 500, "ff".repeat(32), 0);

    await expect(
      (factory as any).mergeStasTransactions(
        [
          makeOutPoint(stasWallet, 20, "aa".repeat(32), 0),
          makeOutPoint(stasWallet, 20, "bb".repeat(32), 1),
        ],
        30,
        feeUtxo,
      ),
    ).rejects.toThrow("Transaction " + "aa".repeat(32) + " not found");
  });
});
