import { Wallet } from "../src/bitcoin/wallet";
import { OutPoint } from "../src/bitcoin/out-point";
import { ScriptType } from "../src/bitcoin/script-type";
import { P2pkhBuilder } from "../src/script/build/p2pkh-builder";
import { buildStas3Flags } from "../src/script/build/stas3-freeze-multisig-builder";
import { BuildDstasBaseTx, BuildDstasIssueTxs } from "../src/dstas-factory";
import { PrivateKey } from "../src/bitcoin/private-key";
import { TokenScheme } from "../src/bitcoin/token-scheme";
import { fromHex, toHex } from "../src/bytes";

describe("DSTAS factory guards", () => {
  test("merge rejects more than 2 STAS inputs", () => {
    const wallet = Wallet.fromMnemonic(
      "group spy extend supreme monkey judge avocado cancel exit educate modify bubble",
    ).deriveWallet("m/44'/236'/0'/0/0");
    const script = new P2pkhBuilder(wallet.Address).toBytes();

    const makeOutPoint = (txByte: string, satoshis: number) =>
      new OutPoint(
        txByte.repeat(64),
        0,
        script,
        satoshis,
        wallet.Address,
        ScriptType.p2pkh,
      );

    expect(() =>
      BuildDstasBaseTx({
        stasPayments: [
          { OutPoint: makeOutPoint("0", 100), Owner: wallet },
          { OutPoint: makeOutPoint("1", 100), Owner: wallet },
          { OutPoint: makeOutPoint("2", 100), Owner: wallet },
        ],
        feePayment: { OutPoint: makeOutPoint("3", 1000), Owner: wallet },
        destinations: [
          {
            Satoshis: 300,
            LockingParams: {
              owner: wallet.Address.Hash160,
              actionData: null,
              redemptionPkh: wallet.Address.Hash160,
              frozen: false,
              flags: buildStas3Flags({ freezable: false }),
              serviceFields: [],
              optionalData: [],
            },
          },
        ],
      }),
    ).toThrow("At most 2 STAS inputs are supported");
  });

  test("authority multisig rejects duplicate public keys by default", () => {
    const issuer = new PrivateKey(fromHex("01".padStart(64, "0")));
    const issuerScript = new P2pkhBuilder(issuer.Address).toBytes();
    const issuerOutPoint = new OutPoint(
      "11".repeat(32),
      0,
      issuerScript,
      5000,
      issuer.Address,
      ScriptType.p2pkh,
    );

    const duplicatePubKey = toHex(issuer.PublicKey);
    const scheme = new TokenScheme(
      "DupAuth",
      toHex(issuer.Address.Hash160),
      "DUP",
      1,
      {
        freeze: true,
        freezeAuthority: {
          m: 2,
          publicKeys: [duplicatePubKey, duplicatePubKey],
        },
      },
    );

    expect(() =>
      BuildDstasIssueTxs({
        fundingPayment: { OutPoint: issuerOutPoint, Owner: issuer },
        scheme,
        destinations: [{ Satoshis: 100, To: issuer.Address }],
      }),
    ).toThrow("duplicate public keys");
  });

  test("authority multisig rejects more than 5 public keys", () => {
    const issuer = new PrivateKey(fromHex("09".padStart(64, "0")));
    const issuerScript = new P2pkhBuilder(issuer.Address).toBytes();
    const issuerOutPoint = new OutPoint(
      "22".repeat(32),
      0,
      issuerScript,
      5000,
      issuer.Address,
      ScriptType.p2pkh,
    );

    const pubKeys = [1, 2, 3, 4, 5, 6].map((i) =>
      toHex(
        new PrivateKey(fromHex(i.toString(16).padStart(64, "0"))).PublicKey,
      ),
    );
    const scheme = new TokenScheme(
      "TooManyAuthKeys",
      toHex(issuer.Address.Hash160),
      "TMK",
      1,
      {
        freeze: true,
        freezeAuthority: {
          m: 3,
          publicKeys: pubKeys,
        },
      },
    );

    expect(() =>
      BuildDstasIssueTxs({
        fundingPayment: { OutPoint: issuerOutPoint, Owner: issuer },
        scheme,
        destinations: [{ Satoshis: 100, To: issuer.Address }],
      }),
    ).toThrow("supports at most 5 public keys");
  });

  test("owner multisig rejects more than 5 public keys", () => {
    const issuer = new PrivateKey(fromHex("0a".padStart(64, "0")));
    const issuerScript = new P2pkhBuilder(issuer.Address).toBytes();
    const issuerOutPoint = new OutPoint(
      "33".repeat(32),
      0,
      issuerScript,
      5000,
      issuer.Address,
      ScriptType.p2pkh,
    );

    const pubKeys = [11, 12, 13, 14, 15, 16].map((i) =>
      toHex(
        new PrivateKey(fromHex(i.toString(16).padStart(64, "0"))).PublicKey,
      ),
    );
    const scheme = new TokenScheme(
      "TooManyOwnerKeys",
      toHex(issuer.Address.Hash160),
      "TOK",
      1,
    );

    expect(() =>
      BuildDstasIssueTxs({
        fundingPayment: { OutPoint: issuerOutPoint, Owner: issuer },
        scheme,
        destinations: [
          {
            Satoshis: 100,
            ToOwnerMultisig: {
              m: 3,
              publicKeys: pubKeys,
            },
          },
        ],
      }),
    ).toThrow("supports at most 5 public keys");
  });
});
