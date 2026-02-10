import { Address } from "../../bitcoin/address";
import { ScriptType } from "../../bitcoin/script-type";
import { p2mpkhTokens } from "../script-samples";
import { ScriptToken } from "../script-token";
import { ScriptBuilder } from "./script-builder";

export class P2mpkhBuilder extends ScriptBuilder {
  constructor(address: Address) {
    super(ScriptType.p2mpkh, address);

    for (const token of p2mpkhTokens) {
      if (token.IsReceiverId) {
        const receiver = ScriptToken.fromBytes(address.Hash160);
        receiver.IsReceiverId = true;

        this._tokens.push(receiver);
      } else {
        this._tokens.push(ScriptToken.fromScriptToken(token));
      }
    }
  }
}
