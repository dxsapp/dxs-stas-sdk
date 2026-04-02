import { jest } from "@jest/globals";
import { Address } from "../src/bitcoin/address";
import { OutPoint } from "../src/bitcoin/out-point";
import { ScriptType } from "../src/bitcoin/script-type";
import { TokenScheme } from "../src/bitcoin/token-scheme";
import { Transaction } from "../src/bitcoin/transaction";
import { TransactionOutput } from "../src/bitcoin/transaction-output";
import { Wallet } from "../src/bitcoin/wallet";
import { fromHex } from "../src/bytes";
import { StasBundleFactory } from "../src/stas-bundle-factory";
import { P2pkhBuilder } from "../src/script/build/p2pkh-builder";
import { P2stasBuilder } from "../src/script/build/p2stas-builder";
import { TransactionReader } from "../src/transaction";

const mnemonicA =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const mnemonicB =
  "legal winner thank year wave sausage worth useful legal winner thank yellow";
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

const makeStasOutPoint = (
  wallet: Wallet,
  tokenScheme: TokenScheme,
  satoshis: number,
  txId: string,
  vout: number,
) =>
  new OutPoint(
    txId,
    vout,
    new P2stasBuilder(
      wallet.Address,
      tokenScheme.TokenId,
      tokenScheme.Symbol,
    ).toBytes(),
    satoshis,
    wallet.Address,
    ScriptType.p2stas,
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
  const getTransactions: any =
    overrides?.getTransactions ?? jest.fn(async () => ({}));

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

const makeStubTransaction = (tag: number, outPoints: OutPoint[]) =>
  new Transaction(
    new Uint8Array([tag]),
    [],
    outPoints.map(
      (outPoint) =>
        new TransactionOutput(outPoint.Satoshis, outPoint.LockingScript),
    ),
    1,
    0,
  );

describe("stas bundle factory", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

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
    expect(
      (factory as any).getStasUtxo(utxos, 45).map((x: OutPoint) => x.Satoshis),
    ).toEqual([20, 30]);
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

    await expect(factory.createBundle(60, recipient)).resolves.toEqual(
      finalResult,
    );
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

  test("buildFeeTransaction builds a multi-input fee transaction and derives the fee outpoint", () => {
    const { factory, feeWallet } = createFactory();
    const utxos = [
      makeOutPoint(feeWallet, 80, "aa".repeat(32), 0),
      makeOutPoint(feeWallet, 160, "bb".repeat(32), 1),
      makeOutPoint(feeWallet, 220, "cc".repeat(32), 2),
    ];

    const result = (factory as any).buildFeeTransaction(utxos, 200) as {
      feeTransaction?: string;
      feeUtxo: OutPoint;
    };

    expect(result.feeTransaction).toBeDefined();
    expect(result.feeUtxo.Vout).toBe(0);
    expect(result.feeUtxo.TxId).toHaveLength(64);
    expect(result.feeUtxo.Address?.Value).toBe(feeWallet.Address.Value);
    expect(result.feeUtxo.Satoshis).toBeGreaterThanOrEqual(200);
    expect(result.feeUtxo.Satoshis).toBeLessThan(
      utxos[0].Satoshis + utxos[1].Satoshis + utxos[2].Satoshis,
    );
  });

  test("_createBundle uses the transfer path when the merged utxo exactly matches the target", async () => {
    const { factory, stasWallet, feeWallet } = createFactory();
    const stasUtxo = makeOutPoint(stasWallet, 50, "aa".repeat(32), 0);
    const feeUtxo = makeOutPoint(feeWallet, 500, "ff".repeat(32), 0);

    jest.spyOn(factory as any, "mergeStasTransactions").mockResolvedValue({
      mergeTransactions: ["merge-hex"],
      mergeFeeUtxo: feeUtxo,
      stasUtxo,
    });
    const buildTransferSpy = jest
      .spyOn(factory as any, "buildTransferTransaction")
      .mockReturnValue("transfer-hex");
    jest.spyOn(TransactionReader, "readHex").mockReturnValue({
      Outputs: [{ Satoshis: 50 }, { Satoshis: 470 }],
    } as Transaction);

    const result = await (factory as any)._createBundle(
      [],
      [stasUtxo],
      50,
      feeUtxo,
      recipient,
    );

    expect(buildTransferSpy).toHaveBeenCalledWith(
      stasUtxo,
      feeUtxo,
      recipient,
      undefined,
    );
    expect(result.transactions).toEqual(["merge-hex", "transfer-hex"]);
    expect(result.feeSatoshis).toBe(30);
  });

  test("_createBundle uses the split path when the merged utxo is larger than the target", async () => {
    const { factory, stasWallet, feeWallet } = createFactory();
    const stasUtxo = makeOutPoint(stasWallet, 80, "aa".repeat(32), 0);
    const feeUtxo = makeOutPoint(feeWallet, 500, "ff".repeat(32), 0);
    const note = [fromHex("abcd")];

    jest.spyOn(factory as any, "mergeStasTransactions").mockResolvedValue({
      mergeFeeUtxo: feeUtxo,
      stasUtxo,
    });
    const buildSplitSpy = jest
      .spyOn(factory as any, "buildSplitTransaction")
      .mockReturnValue("split-hex");
    jest.spyOn(TransactionReader, "readHex").mockReturnValue({
      Outputs: [{ Satoshis: 50 }, { Satoshis: 460 }, { Satoshis: 0 }],
    } as Transaction);

    const result = await (factory as any)._createBundle(
      [],
      [stasUtxo],
      50,
      feeUtxo,
      recipient,
      note,
    );

    expect(buildSplitSpy).toHaveBeenCalledWith(
      stasUtxo,
      50,
      recipient,
      feeUtxo,
      note,
    );
    expect(result.transactions).toEqual(["split-hex"]);
    expect(result.feeSatoshis).toBe(40);
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

  test("mergeStasTransactions performs a real merge branch and updates the tail fee outpoint", async () => {
    const { factory, stasWallet, feeWallet } = createFactory();
    const tokenScheme = new TokenScheme("Test", "11".repeat(20), "TST", 1);
    const left = makeStasOutPoint(
      stasWallet,
      tokenScheme,
      20,
      "aa".repeat(32),
      0,
    );
    const right = makeStasOutPoint(
      stasWallet,
      tokenScheme,
      20,
      "bb".repeat(32),
      0,
    );
    const sourceTransactions = {
      [left.TxId]: makeStubTransaction(1, [left]),
      [right.TxId]: makeStubTransaction(2, [right]),
    };
    const { factory: mergeFactory } = createFactory({
      getTransactions: jest.fn(async () => {
        return {
          ...sourceTransactions,
        };
      }),
    });
    const feeUtxo = makeOutPoint(feeWallet, 50_000, "ff".repeat(32), 0);
    const result = await (mergeFactory as any).mergeStasTransactions(
      [left, right],
      30,
      feeUtxo,
    );
    const mergeTx = TransactionReader.readHex(result.mergeTransactions![0]);

    expect(result.mergeTransactions).toHaveLength(1);
    expect(result.stasUtxo.Satoshis).toBe(30);
    expect(result.mergeFeeUtxo.Satoshis).toBeLessThan(feeUtxo.Satoshis);
    expect(mergeTx.Outputs).toHaveLength(3);
    expect(mergeTx.Outputs[0].Satoshis).toBe(30);
    expect(mergeTx.Outputs[1].Satoshis).toBe(10);
  });

  test("mergeStasTransactions switches through the transfer-after-depth branch", async () => {
    const { stasWallet, feeWallet } = createFactory();
    const tokenScheme = new TokenScheme("Test", "11".repeat(20), "TST", 1);
    const initialUtxos = Array.from({ length: 9 }, (_, index) =>
      makeStasOutPoint(
        stasWallet,
        tokenScheme,
        5,
        (index + 1).toString(16).padStart(64, `${index + 1}`),
        0,
      ),
    );
    const sourceTransactions = Object.fromEntries(
      initialUtxos.map((utxo, index) => [
        utxo.TxId,
        makeStubTransaction(index + 10, [utxo]),
      ]),
    );
    const { factory } = createFactory({
      getTransactions: jest.fn(
        async () => sourceTransactions as Record<string, Transaction>,
      ) as any,
    });
    const feeUtxo = makeOutPoint(feeWallet, 20_000, "ff".repeat(32), 0);

    const result = await (factory as any).mergeStasTransactions(
      initialUtxos,
      30,
      feeUtxo,
    );
    const parsedTransactions = result.mergeTransactions!.map((hex: string) =>
      TransactionReader.readHex(hex),
    );
    const transferCount = parsedTransactions.filter(
      (tx: Transaction) => tx.Inputs.length === 2,
    ).length;
    const finalTx = parsedTransactions[parsedTransactions.length - 1];

    expect(result.mergeTransactions).toHaveLength(10);
    expect(transferCount).toBeGreaterThanOrEqual(2);
    expect(finalTx.Outputs[0].Satoshis).toBe(30);
    expect(finalTx.Outputs[1].Satoshis).toBe(15);
    expect(result.stasUtxo.Satoshis).toBe(30);
    expect(result.mergeFeeUtxo.Satoshis).toBeLessThan(feeUtxo.Satoshis);
  });

  test("mergeStasTransactions fails when a source transaction is missing", async () => {
    const { factory, stasWallet, feeWallet } = createFactory({
      getTransactions: jest.fn(async () => ({}) as Record<string, Transaction>),
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

  test("buildTransferTransaction forwards note and no-note variants", () => {
    const { factory, stasWallet, feeWallet } = createFactory();
    const tokenScheme = new TokenScheme("Test", "11".repeat(20), "TST", 1);
    const stasUtxo = makeStasOutPoint(
      stasWallet,
      tokenScheme,
      40,
      "aa".repeat(32),
      0,
    );
    const feeUtxo = makeOutPoint(feeWallet, 50_000, "ff".repeat(32), 0);
    const note = [fromHex("0102")];
    const withoutNote = TransactionReader.readHex(
      (factory as any).buildTransferTransaction(stasUtxo, feeUtxo, recipient),
    );
    const withNote = TransactionReader.readHex(
      (factory as any).buildTransferTransaction(
        stasUtxo,
        feeUtxo,
        recipient,
        note,
      ),
    );

    expect(withoutNote.Outputs).toHaveLength(2);
    expect(withNote.Outputs).toHaveLength(3);
    expect(withoutNote.Outputs[0].Satoshis).toBe(40);
    expect(withNote.Outputs[0].Satoshis).toBe(40);
    expect(withNote.Outputs[1].Address?.Value).toBe(feeWallet.Address.Value);
  });

  test("buildSplitTransaction forwards note variants and keeps remainder at the stas wallet", () => {
    const { factory, stasWallet, feeWallet } = createFactory();
    const tokenScheme = new TokenScheme("Test", "11".repeat(20), "TST", 1);
    const stasUtxo = makeStasOutPoint(
      stasWallet,
      tokenScheme,
      70,
      "aa".repeat(32),
      0,
    );
    const feeUtxo = makeOutPoint(feeWallet, 5_000, "ff".repeat(32), 0);
    const note = [fromHex("0a0b")];
    const withoutNote = TransactionReader.readHex(
      (factory as any).buildSplitTransaction(stasUtxo, 45, recipient, feeUtxo),
    );
    const withNote = TransactionReader.readHex(
      (factory as any).buildSplitTransaction(
        stasUtxo,
        45,
        recipient,
        feeUtxo,
        note,
      ),
    );

    expect(withoutNote.Outputs).toHaveLength(3);
    expect(withNote.Outputs).toHaveLength(4);
    expect(withoutNote.Outputs[0].Satoshis).toBe(45);
    expect(withoutNote.Outputs[1].Satoshis).toBe(25);
    expect(withoutNote.Outputs[1].Address?.Value).toBe(
      stasWallet.Address.Value,
    );
    expect(withNote.Outputs[2].Address?.Value).toBe(feeWallet.Address.Value);
  });
});
