import { OpCode } from "../../bitcoin/op-codes";
import { ScriptType } from "../../bitcoin/script-type";
import { nullDataTokens } from "../script-samples";
import { ScriptToken } from "../script-token";
import { ScriptBuilder } from "./script-builder";
import { Bytes } from "../../bytes";

export class NullDataBuilder extends ScriptBuilder {
  constructor(data: Bytes[]) {
    super(ScriptType.nullData);

    for (const token of nullDataTokens) {
      this._tokens.push(ScriptToken.fromScriptToken(token));
    }

    this.addOpCode(OpCode.OP_RETURN);

    for (const segment of data) {
      this.addData(segment);
    }
  }
}
