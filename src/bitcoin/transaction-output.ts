import { LockingScriptReader } from "../script/read/locking-script-reader";
import { Bytes, toHex } from "../bytes";
import { Address } from "./address";
import { ScriptType } from "./script-type";

export class TransactionOutput {
  Satoshis: number;
  LockignScript: Bytes;
  ScriptType: ScriptType = ScriptType.unknown;
  Address?: Address;
  TokenId?: string;
  Symbol?: string;
  data: Bytes[] = [];

  constructor(satoshis: number, lockignScript: Bytes) {
    this.Satoshis = satoshis;
    this.LockignScript = lockignScript;

    const reader = LockingScriptReader.read(this.LockignScript);

    this.ScriptType = reader.ScriptType;
    this.Address = reader.Address;

    if (reader.ScriptType === ScriptType.nullData) {
      this.data = reader.Data ?? [];
      return;
    }

    if (
      reader.ScriptType === ScriptType.p2pkh ||
      reader.ScriptType === ScriptType.p2mpkh
    ) {
      this.data = reader.Data ?? [];
      return;
    }

    if (reader.ScriptType === ScriptType.p2stas) {
      this.TokenId = reader.getTokenId() ?? undefined;
      this.Symbol = reader.getSymbol() ?? undefined;

      if (reader.Data && reader.Data.length > 2) {
        for (let i = 2; i < reader.Data.length; i++) {
          this.data.push(reader.Data[i]);
        }
      }
      return;
    }

    if (reader.ScriptType === ScriptType.dstas && reader.Dstas) {
      this.TokenId = toHex(reader.Dstas.Redemption);
      this.data.push(reader.Dstas.Flags);
      this.data.push(...reader.Dstas.ServiceFields);
      this.data.push(...reader.Dstas.OptionalData);
    }
  }
}
