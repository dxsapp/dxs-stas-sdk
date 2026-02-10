import { Wallet } from "../src/bitcoin/wallet";
import { OutPoint } from "../src/bitcoin/out-point";
import { ScriptType } from "../src/bitcoin/script-type";
import { ScriptBuilder } from "../src/script/build/script-builder";
import {
  buildStas3Flags,
  buildStas3FreezeMultisigTokens,
} from "../src/script/build/stas3-freeze-multisig-builder";
import { buildSwapActionData } from "../src/script/stas3-second-field";
import { ResolveDstasSwapMode } from "../src/dstas-factory";
import { fromHex } from "../src/bytes";

const mnemonic =
  "group spy extend supreme monkey judge avocado cancel exit educate modify bubble";

const tokenId = fromHex("b4ab0fffa02223a8a40d9e7f7823e61b38625382");

const makeDstasOutPoint = (
  txIdHexByte: string,
  owner: Wallet,
  actionData: Uint8Array | null,
): OutPoint => {
  const tokens = buildStas3FreezeMultisigTokens({
    owner: owner.Address.Hash160,
    actionData,
    redemptionPkh: tokenId,
    frozen: false,
    flags: buildStas3Flags({ freezable: false }),
    serviceFields: [],
    optionalData: [],
  });
  const lockingScript = ScriptBuilder.fromTokens(tokens, ScriptType.dstas);
  return new OutPoint(
    txIdHexByte.repeat(64),
    0,
    lockingScript.toBytes(),
    100,
    owner.Address,
    ScriptType.dstas,
  );
};

describe("ResolveDstasSwapMode", () => {
  test("returns transfer-swap when only one input has swap actionData", () => {
    const owner =
      Wallet.fromMnemonic(mnemonic).deriveWallet("m/44'/236'/0'/0/0");
    const swapAction = buildSwapActionData({
      requestedScriptHash: new Uint8Array(32).fill(0x11),
      requestedPkh: owner.Address.Hash160,
      rateNumerator: 3,
      rateDenominator: 2,
    });

    const transferLike = {
      OutPoint: makeDstasOutPoint("1", owner, null),
      Owner: owner,
    };
    const swapLike = {
      OutPoint: makeDstasOutPoint("2", owner, swapAction),
      Owner: owner,
    };

    const mode = ResolveDstasSwapMode([transferLike, swapLike]);
    expect(mode).toBe("transfer-swap");
  });

  test("returns swap-swap when both inputs have swap actionData", () => {
    const owner =
      Wallet.fromMnemonic(mnemonic).deriveWallet("m/44'/236'/0'/0/0");
    const swapAction = buildSwapActionData({
      requestedScriptHash: new Uint8Array(32).fill(0x22),
      requestedPkh: owner.Address.Hash160,
      rateNumerator: 5,
      rateDenominator: 4,
    });

    const left = {
      OutPoint: makeDstasOutPoint("3", owner, swapAction),
      Owner: owner,
    };
    const right = {
      OutPoint: makeDstasOutPoint("4", owner, swapAction),
      Owner: owner,
    };

    const mode = ResolveDstasSwapMode([left, right]);
    expect(mode).toBe("swap-swap");
  });
});
