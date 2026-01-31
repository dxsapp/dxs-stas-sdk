import { Address } from "../src/bitcoin/address";
import { OutPoint } from "../src/bitcoin/out-point";
import { PrivateKey } from "../src/bitcoin/private-key";
import { ScriptType } from "../src/bitcoin/script-type";
import { TokenScheme } from "../src/bitcoin/token-scheme";
import { TransactionBuilder } from "../src/transaction/build/transaction-builder";
import {
  BuildMergeTx,
  BuildSplitTx,
  BuildTransferTx,
} from "../src/transaction-factory";
import { TransactionReader } from "../src/transaction/read/transaction-reader";
import { fromHex, utf8ToBytes } from "../src/bytes";
import {
  SourceTxRaw,
  IssueTxRaw,
  TransferNoNoteRaw,
  TransferWithNoteRaw,
  SplitNoNoteRaw,
  SplitWithNoteRaw,
  MergeNoNoteRaw,
  MergeWithNoteRaw,
  MergeSplitWithNoteRaw,
  RedeemSplitWithNoteRaw,
  RedeemWithNoteRaw,
  SplitWithNote2Raw,
  MergeWithNote2Raw,
  TransferToIssuerRaw,
} from "./stas-transactios";

const issuerPrivateKey = new PrivateKey(
  fromHex("b62fd57a07804f79291317261054eb9b19c9ccec49146c38b30a29d48636c368"),
);
const issuerAddress = Address.fromBase58("1MkvWa82XHFqmRHaiRZ8BqZS7Uc83wekjp");
const alicePrivateKey = new PrivateKey(
  fromHex("77b1b7d5bfe1288d94f829baba86d503e1a06b571aaa5d36820be19ef2fe520e"),
);
const aliceAddress = Address.fromBase58("1C2dVLqv1kjNn7pztpQ51bpXVEJfoWUNxe");
const tokenScheme = new TokenScheme(
  "Moi token",
  "e3b111de8fec527b41f4189e313638075d96ccd6",
  "MOI",
  1,
);

describe("testing transaction builder", () => {
  test("build open position transaction", () => {
    const message1 = utf8ToBytes("bsvtest");
    const message2 = utf8ToBytes("ulWY+84HZb02vz3iS2690DQ==,m107,tb,a0.01");
    const message3 = utf8ToBytes("text");
    const message4 = utf8ToBytes("B");
    const from = Address.fromBase58("1MkvWa82XHFqmRHaiRZ8BqZS7Uc83wekjp");
    const outPoint = new OutPoint(
      "bedacaaeed9eef91aa359f4e7be2c674e6f0ff150f358b7439469adbc0ccc442",
      2,
      fromHex("76a914e3b111de8fec527b41f4189e313638075d96ccd688ac"),
      20340,
      from,
      ScriptType.p2pkh,
    );
    const saatoshis = 0.000024 * 100_000_000;
    const txBuilder = TransactionBuilder.init()
      .addInput(outPoint, issuerPrivateKey)
      .addP2PkhOutput(
        saatoshis,
        Address.fromBase58("17FCMLqkwyQ4aJGmAD9T2aGKq1UhPmyPmt"),
      )
      .addNullDataOutput([message1, message2, message3, message4])
      .addChangeOutputWithFee(from, outPoint.Satoshis - saatoshis, 0.05)
      .sign();

    const result = txBuilder.toHex();

    expect(result).toBe(
      "010000000142c4ccc0db9a4639748b350f15fff0e674c6e27b4e9f35aa91ef9eedaecadabe020000006a473044022034577ba0f2fbc54ff60d846555c23b74b9ae2721d95f5758453581ecd2a133400220258d4ffa96bf26e6b3563111ec1012dae1c7b7123adfe0fbaeddcdc682e6493341210377efa9937bd4a52edc99f431e2d61f888c173498ded048642343a8133b07c42bffffffff0360090000000000001976a91444800da3829882d058f5938992b16b53e0c3cb5188ac000000000000000039006a076273767465737427756c57592b3834485a623032767a3369533236393044513d3d2c6d3130372c74622c61302e30310474657874014205460000000000001976a914e3b111de8fec527b41f4189e313638075d96ccd688ac00000000",
    );
  });

  test("build STAS Issue transaction", () => {
    const sourceTx = TransactionReader.readHex(SourceTxRaw);
    const stasOutPoint = OutPoint.fromTransaction(sourceTx, 0);
    const fundingOutPoint = OutPoint.fromTransaction(sourceTx, 1);
    const tx = TransactionBuilder.init()
      .addInput(stasOutPoint, issuerPrivateKey)
      .addInput(fundingOutPoint, issuerPrivateKey)
      .addStasOutputByScheme(tokenScheme, stasOutPoint.Satoshis, aliceAddress)
      .addChangeOutputWithFee(
        fundingOutPoint.Address,
        fundingOutPoint.Satoshis,
        0.05,
      )
      .sign()
      .toHex();

    expect(tx).toBe(IssueTxRaw);
  });

  test("build STAS transfer transaction", () => {
    const sourceTx = TransactionReader.readHex(IssueTxRaw);
    const stasOutPoint = OutPoint.fromTransaction(sourceTx, 0);
    const fundingOutPoint = OutPoint.fromTransaction(sourceTx, 1);
    const tx = BuildTransferTx({
      tokenScheme,
      stasPayment: { OutPoint: stasOutPoint, Owner: alicePrivateKey },
      feePayment: { OutPoint: fundingOutPoint, Owner: issuerPrivateKey },
      to: aliceAddress,
    });

    expect(tx).toBe(TransferNoNoteRaw);
  });

  test("build STAS transfer with note transaction", () => {
    const sourceTx = TransactionReader.readHex(TransferNoNoteRaw);
    const stasOutPoint = OutPoint.fromTransaction(sourceTx, 0);
    const fundingOutPoint = OutPoint.fromTransaction(sourceTx, 1);
    const tx = BuildTransferTx({
      tokenScheme,
      stasPayment: { OutPoint: stasOutPoint, Owner: alicePrivateKey },
      feePayment: { OutPoint: fundingOutPoint, Owner: issuerPrivateKey },
      to: aliceAddress,
      note: [utf8ToBytes("DXS"), utf8ToBytes("Transfer test")],
    });

    expect(tx).toBe(TransferWithNoteRaw);
  });

  test("build STAS Split no note transaction", () => {
    const sourceTx = TransactionReader.readHex(TransferWithNoteRaw);
    const stasOutPoint = OutPoint.fromTransaction(sourceTx, 0);
    const fundingOutPoint = OutPoint.fromTransaction(sourceTx, 1);
    const tx = BuildSplitTx({
      tokenScheme,
      stasPayment: { OutPoint: stasOutPoint, Owner: alicePrivateKey },
      feePayment: { OutPoint: fundingOutPoint, Owner: issuerPrivateKey },
      destinations: [
        { Satoshis: 25, Address: aliceAddress },
        { Satoshis: 25, Address: aliceAddress },
      ],
    });

    expect(tx).toBe(SplitNoNoteRaw);
  });

  test("build STAS Merge no note transaction", () => {
    const sourceTx = TransactionReader.readHex(SplitNoNoteRaw);
    const stasOutPoint1 = OutPoint.fromTransaction(sourceTx, 0);
    const stasOutPoint2 = OutPoint.fromTransaction(sourceTx, 1);
    const fundingOutPoint = OutPoint.fromTransaction(sourceTx, 2);
    const tx = BuildMergeTx({
      tokenScheme,
      outPoint1: stasOutPoint1,
      outPoint2: stasOutPoint2,
      owner: alicePrivateKey,
      feePayment: { OutPoint: fundingOutPoint, Owner: issuerPrivateKey },
      destination: {
        Satoshis: stasOutPoint1.Satoshis + stasOutPoint2.Satoshis,
        Address: aliceAddress,
      },
    });

    expect(tx).toBe(MergeNoNoteRaw);
  });

  test("build STAS Split with note transaction", () => {
    const sourceTx = TransactionReader.readHex(MergeNoNoteRaw);
    const stasOutPoint = OutPoint.fromTransaction(sourceTx, 0);
    const fundingOutPoint = OutPoint.fromTransaction(sourceTx, 1);
    const tx = BuildSplitTx({
      tokenScheme,
      stasPayment: { OutPoint: stasOutPoint, Owner: alicePrivateKey },
      feePayment: { OutPoint: fundingOutPoint, Owner: issuerPrivateKey },
      destinations: [
        { Satoshis: 25, Address: aliceAddress },
        { Satoshis: 25, Address: aliceAddress },
      ],
      note: [utf8ToBytes("DXS"), utf8ToBytes("Split test")],
    });

    expect(tx).toBe(SplitWithNoteRaw);
  });

  test("build STAS Merge with note transaction", () => {
    const sourceTx = TransactionReader.readHex(SplitWithNoteRaw);
    const stasOutPoint1 = OutPoint.fromTransaction(sourceTx, 0);
    const stasOutPoint2 = OutPoint.fromTransaction(sourceTx, 1);
    const fundingOutPoint = OutPoint.fromTransaction(sourceTx, 2);
    const tx = BuildMergeTx({
      tokenScheme,
      outPoint1: stasOutPoint1,
      outPoint2: stasOutPoint2,
      owner: alicePrivateKey,
      feePayment: {
        OutPoint: fundingOutPoint,
        Owner: issuerPrivateKey,
      },
      destination: { Satoshis: 50, Address: aliceAddress },
      note: [utf8ToBytes("DXS"), utf8ToBytes("Merge test")],
    });

    expect(tx).toBe(MergeWithNoteRaw);
  });

  test("build STAS Split no note 2 transaction", () => {
    const sourceTx = TransactionReader.readHex(MergeWithNoteRaw);
    const stasOutPoint = OutPoint.fromTransaction(sourceTx, 0);
    const fundingOutPoint = OutPoint.fromTransaction(sourceTx, 1);
    const tx = BuildSplitTx({
      tokenScheme,
      stasPayment: { OutPoint: stasOutPoint, Owner: alicePrivateKey },
      feePayment: { OutPoint: fundingOutPoint, Owner: issuerPrivateKey },
      destinations: [
        { Satoshis: 25, Address: aliceAddress },
        { Satoshis: 25, Address: aliceAddress },
      ],
    });

    expect(tx).toBe(SplitWithNote2Raw);
  });

  test("build STAS MergeSplit with note transaction", () => {
    const sourceTx = TransactionReader.readHex(SplitWithNote2Raw);
    const stasOutPoint1 = OutPoint.fromTransaction(sourceTx, 0);
    const stasOutPoint2 = OutPoint.fromTransaction(sourceTx, 1);
    const fundingOutPoint = OutPoint.fromTransaction(sourceTx, 2);
    const tx = BuildMergeTx({
      tokenScheme,
      outPoint1: stasOutPoint1,
      outPoint2: stasOutPoint2,
      owner: alicePrivateKey,
      feePayment: {
        OutPoint: fundingOutPoint,
        Owner: issuerPrivateKey,
      },
      destination: { Satoshis: 25, Address: aliceAddress },
      splitDestination: { Satoshis: 25, Address: aliceAddress },
      note: [utf8ToBytes("DXS"), utf8ToBytes("Merge split test")],
    });

    expect(tx).toBe(MergeSplitWithNoteRaw);
  });

  test("build STAS Merge with note transaction", () => {
    const sourceTx = TransactionReader.readHex(MergeSplitWithNoteRaw);
    const stasOutPoint1 = OutPoint.fromTransaction(sourceTx, 0);
    const stasOutPoint2 = OutPoint.fromTransaction(sourceTx, 1);
    const fundingOutPoint = OutPoint.fromTransaction(sourceTx, 2);
    const tx = BuildMergeTx({
      tokenScheme,
      outPoint1: stasOutPoint1,
      outPoint2: stasOutPoint2,
      owner: alicePrivateKey,
      feePayment: {
        OutPoint: fundingOutPoint,
        Owner: issuerPrivateKey,
      },
      destination: { Satoshis: 50, Address: aliceAddress },
      note: [utf8ToBytes("DXS"), utf8ToBytes("Merge test 2")],
    });

    expect(tx).toBe(MergeWithNote2Raw);
  });

  test("build STAS Transfer to Isssuer transaction", () => {
    const sourceTx = TransactionReader.readHex(MergeWithNote2Raw);
    const stasOutPoint = OutPoint.fromTransaction(sourceTx, 0);
    const fundingOutPoint = OutPoint.fromTransaction(sourceTx, 1);
    const tx = BuildTransferTx({
      tokenScheme,
      stasPayment: { OutPoint: stasOutPoint, Owner: alicePrivateKey },
      feePayment: {
        OutPoint: fundingOutPoint,
        Owner: issuerPrivateKey,
      },
      to: issuerAddress,
      note: [utf8ToBytes("DXS"), utf8ToBytes("Transfer to issuer test")],
    });

    expect(tx).toBe(TransferToIssuerRaw);
  });

  test("build STAS RedeemSplit with note transaction", () => {
    const sourceTx = TransactionReader.readHex(TransferToIssuerRaw);
    const stasOutPoint1 = OutPoint.fromTransaction(sourceTx, 0);
    const fundingOutPoint = OutPoint.fromTransaction(sourceTx, 1);

    const txBuilder = TransactionBuilder.init()
      .addInput(stasOutPoint1, issuerPrivateKey)
      .addInput(fundingOutPoint, issuerPrivateKey)
      .addP2PkhOutput(25, issuerAddress)
      .addStasOutputByScheme(tokenScheme, 25, issuerAddress)
      .addNullDataOutput([
        utf8ToBytes("DXS"),
        utf8ToBytes("Redeem Split test"),
      ]);

    txBuilder.addChangeOutputWithFee(
      fundingOutPoint.Address,
      fundingOutPoint.Satoshis,
      0.05,
      2,
    );

    txBuilder.sign();

    const tx = txBuilder.toHex();

    expect(tx).toBe(RedeemSplitWithNoteRaw);
  });

  test("build STAS Redeem with note transaction", () => {
    const sourceTx = TransactionReader.readHex(RedeemSplitWithNoteRaw);
    const stasOutPoint1 = OutPoint.fromTransaction(sourceTx, 1);
    const fundingOutPoint = OutPoint.fromTransaction(sourceTx, 2);

    const txBuilder = TransactionBuilder.init()
      .addInput(stasOutPoint1, issuerPrivateKey)
      .addInput(fundingOutPoint, issuerPrivateKey)
      .addP2PkhOutput(25, issuerAddress)
      .addNullDataOutput([utf8ToBytes("DXS"), utf8ToBytes("Redeem test")]);

    txBuilder.addChangeOutputWithFee(
      fundingOutPoint.Address,
      fundingOutPoint.Satoshis,
      0.05,
      1,
    );

    txBuilder.sign();

    const tx = txBuilder.toHex();

    expect(tx).toBe(RedeemWithNoteRaw);
  });
});
