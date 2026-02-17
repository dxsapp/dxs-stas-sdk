import { ScriptReader } from "../script/read/script-reader";
import { Address } from "./address";
import { Bytes } from "../bytes";

export class TransactionInput {
  TxId: string;
  Vout: number;
  UnlockingScript: Bytes;
  Sequence: number;

  constructor(
    txId: string,
    vout: number,
    unlockingScript: Bytes,
    sequence: number,
  ) {
    this.TxId = txId;
    this.Vout = vout;
    this.UnlockingScript = unlockingScript;
    this.Sequence = sequence;
  }

  tryGetAddress = () => {
    const scriptTokens = ScriptReader.read(this.UnlockingScript);
    if (scriptTokens.length === 0) return undefined;
    const lastToken = scriptTokens[scriptTokens.length - 1];
    if (!lastToken?.Data) return undefined;

    if (
      lastToken.DataLength === 33 &&
      (lastToken.Data[0] === 2 || lastToken.Data[0] === 3)
    ) {
      return Address.fromPublicKey(lastToken.Data);
    }
  };
}
