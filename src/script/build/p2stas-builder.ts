import { Address } from "../../bitcoin/address";
import { OpCode } from "../../bitcoin/op-codes";
import { ScriptType } from "../../bitcoin/script-type";
import { getP2stasTokens } from "../script-samples";
import { ScriptToken } from "../script-token";
import { ScriptBuilder } from "./script-builder";
import { Bytes, fromHex, utf8ToBytes } from "../../bytes";

export class P2stasBuilder extends ScriptBuilder {
  constructor(
    address: Address,
    tokenId: string,
    symbol: string,
    data: Bytes[] = [],
  ) {
    super(ScriptType.p2stas, address);

    const stasTokens = getP2stasTokens();

    for (const token of stasTokens) {
      if (token.IsReceiverId) {
        const receiver = ScriptToken.fromBytes(address.Hash160);
        receiver.IsReceiverId = true;

        this._tokens.push(receiver);
      } else {
        this._tokens.push(ScriptToken.fromScriptToken(token));
      }
    }

    this.addOpCode(OpCode.OP_RETURN);
    this.addData(fromHex(tokenId));
    this.addData(utf8ToBytes(symbol));

    for (const d of data) {
      this.addData(d);
    }
  }
}
