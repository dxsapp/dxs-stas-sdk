import { Address } from "../../bitcoin/address";
import { OpCode } from "../../bitcoin/op-codes";
import { ScriptType } from "../../bitcoin/script-type";
import { getP2stasTokens } from "../script-samples";
import { ScriptToken } from "../script-token";
import { ScriptBuilder } from "./script-builder";

export class P2stasBuilder extends ScriptBuilder {
  constructor(
    address: Address,
    tokenId: string,
    symbol: string,
    data: Buffer[] = []
  ) {
    super(ScriptType.p2stas, address);

    const stasTokens = getP2stasTokens();

    for (var token of stasTokens) {
      if (token.IsReceiverId) {
        const receiver = ScriptToken.fromBuffer(address.Hash160);
        receiver.IsReceiverId = true;

        this._tokens.push(receiver);
      } else {
        this._tokens.push(ScriptToken.fromScriptToken(token));
      }
    }

    this.addOpCode(OpCode.OP_RETURN);
    this.addData(Buffer.from(tokenId, "hex"));
    this.addData(Buffer.from(symbol, "utf8"));

    for (const d of data) {
      this.addData(d);
    }
  }
}
