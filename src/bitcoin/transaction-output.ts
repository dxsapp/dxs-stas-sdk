import { ScriptReader } from "../script/read/script-reader";
import { p2phkTokens, getP2stasTokens } from "../script/script-samples";
import { ScriptToken } from "../script/script-token";
import { Address } from "./address";
import { OpCode } from "./op-codes";
import { ScriptType } from "./script-type";

export class TransactionOutput {
  Satoshis: number;
  LockignScript: Buffer;
  ScriptType: ScriptType = ScriptType.unknown;
  Address?: Address;
  TokenId?: string;
  Symbol?: string;
  data: Buffer[] = [];

  constructor(satoshis: number, lockignScript: Buffer) {
    this.Satoshis = satoshis;
    this.LockignScript = lockignScript;

    const scriptTokens = ScriptReader.read(this.LockignScript);

    if (!this._isNulData(scriptTokens)) {
      if (!this._isP2pkh(scriptTokens)) {
        this._isP2stas(scriptTokens);
      }
    }
  }

  private _isNulData = (scriptTokens: ScriptToken[]): boolean => {
    if (
      scriptTokens.length > 2 &&
      scriptTokens[0].OpCodeNum === OpCode.OP_0 &&
      scriptTokens[1].OpCodeNum === OpCode.OP_RETURN
    ) {
      for (let i = 2; i < scriptTokens.length; i++)
        this.data.push(scriptTokens[i].Data!);

      this.ScriptType = ScriptType.nullData;

      return true;
    }

    return false;
  };

  private _isP2pkh = (scriptTokens: ScriptToken[]): boolean => {
    if (scriptTokens.length > p2phkTokens.length) return false;

    let opReturnReached = false;

    for (let i = 0; i < scriptTokens.length; i++) {
      const token = scriptTokens[i];

      if (!opReturnReached) {
        if (token.OpCodeNum === OpCode.OP_RETURN) {
          opReturnReached = true;
        } else {
          if (token.OpCodeNum !== p2phkTokens[i].OpCodeNum) return false;

          if (p2phkTokens[i].IsReceiverId)
            this.Address = new Address(token.Data!);
        }
      } else {
        this.data.push(token.Data!);
      }
    }

    this.ScriptType = ScriptType.p2pkh;

    return true;
  };

  private _isP2stas = (scriptTokens: ScriptToken[]): boolean => {
    const p2stasTokens = getP2stasTokens();

    if (scriptTokens.length < p2stasTokens.length) return false;

    let opReturnIdx = -1;

    for (let i = 0; i < scriptTokens.length; i++) {
      const token = scriptTokens[i];

      if (opReturnIdx === -1) {
        if (token.OpCodeNum === OpCode.OP_RETURN) {
          opReturnIdx = i;
        } else {
          if (token.OpCodeNum !== p2stasTokens[i].OpCodeNum) return false;

          if (p2stasTokens[i].IsReceiverId)
            this.Address = new Address(token.Data!);
        }
      } else {
        if (i === opReturnIdx + 1) this.TokenId = token.Data!.toString("hex");
        else if (i === opReturnIdx + 2)
          this.Symbol = token.Data!.toString("utf8");
        else this.data.push(token.Data!);
      }
    }

    this.ScriptType = ScriptType.p2stas;

    return true;
  };
}
