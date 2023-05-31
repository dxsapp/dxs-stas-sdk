import { Address } from "../../bitcoin/address";
import { OpCode } from "../../bitcoin/op-codes";
import { ScriptType } from "../../bitcoin/script-type";
import { p2phkTokens } from "../script-samples";
import { ScriptToken } from "../script-token";
import { ScriptBuilder } from "./script-builder";

export class P2pkhBuilder extends ScriptBuilder {
  private _isOpReturnAdded: boolean = false;

  constructor(address: Address) {
    super(ScriptType.p2pkh, address);

    for (var token of p2phkTokens) {
      if (token.IsReceiverId) {
        const receiver = ScriptToken.fromBuffer(address.Hash160);
        receiver.IsReceiverId = true;

        this._tokens.push(receiver);
      } else {
        this._tokens.push(ScriptToken.fromScriptToken(token));
      }
    }
  }

  addReturnData(data: Buffer) {
    if (!this._isOpReturnAdded) {
      this.addOpCode(OpCode.OP_RETURN);
      this._isOpReturnAdded = true;
    }

    this.addData(data);
  }
}
