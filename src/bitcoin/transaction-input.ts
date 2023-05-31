import { ScriptReader } from "../script/read/script-reader";
import { Address } from "./address";

export class TransactionInput {
  TxId: string;
  Vout: number;
  UnlockingScript: Buffer;
  Sequence: number;

  constructor(
    txId: string,
    vout: number,
    unlockingScript: Buffer,
    sequence: number
  ) {
    this.TxId = txId;
    this.Vout = vout;
    this.UnlockingScript = unlockingScript;
    this.Sequence = sequence;
  }

  tryGetAddress = () => {
    const scriptTokens = ScriptReader.read(this.UnlockingScript);
    const lastToken = scriptTokens[scriptTokens.length - 1];

    if (
      lastToken.DataLength === 33 &&
      (lastToken.Data![0] === 2 || lastToken.Data![0] === 3)
    ) {
      return Address.fromPublicKey(lastToken.Data!);
    }
  };
}
