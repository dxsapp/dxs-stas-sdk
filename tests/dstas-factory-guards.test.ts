import { Wallet } from "../src/bitcoin/wallet";
import { OutPoint } from "../src/bitcoin/out-point";
import { ScriptType } from "../src/bitcoin/script-type";
import { P2pkhBuilder } from "../src/script/build/p2pkh-builder";
import { buildStas3Flags } from "../src/script/build/stas3-freeze-multisig-builder";
import { BuildDstasBaseTx } from "../src/dstas-factory";

describe("DSTAS factory guards", () => {
  test("merge rejects more than 2 STAS inputs", () => {
    const wallet =
      Wallet.fromMnemonic(
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

});
