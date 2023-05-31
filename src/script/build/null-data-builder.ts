import { OpCode } from "../../bitcoin/op-codes";
import { ScriptType } from "../../bitcoin/script-type";
import { nullDataTokens } from "../script-samples";
import { ScriptToken } from "../script-token";
import { ScriptBuilder } from "./script-builder";

export class NullDataBuilder extends ScriptBuilder {
  constructor(data: Buffer[]) {
    super(ScriptType.nullData);

    for (var token of nullDataTokens) {
      this._tokens.push(ScriptToken.fromScriptToken(token));
    }

    this.addOpCode(OpCode.OP_RETURN);

    for (var segment of data) {
      this.addData(segment);
    }
  }
}
