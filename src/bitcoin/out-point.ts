import { TransactionReader } from "../transaction";
import { Address } from "./address";
import { ScriptType } from "./script-type";
import { Transaction } from "./transaction";
import { Bytes } from "../bytes";
import { getStrictModeConfig } from "../security/strict-mode";
import { LockingScriptReader } from "../script/read/locking-script-reader";

export class OutPoint {
  TxId: string;
  Vout: number;
  private _lockingScript: Bytes;
  Satoshis: number;
  Address: Address;
  ScriptType: ScriptType;
  Transaction?: Transaction;

  constructor(
    txId: string,
    vout: number,
    lockingScript: Bytes,
    satoshis: number,
    address: Address,
    scriptType: ScriptType,
  ) {
    this.TxId = txId;
    this.Vout = vout;
    this._lockingScript = lockingScript;
    this.Satoshis = satoshis;
    this.Address = address;
    this.ScriptType = scriptType;

    if (getStrictModeConfig().strictOutPointValidation) {
      const reader = LockingScriptReader.read(lockingScript);

      if (reader.ScriptType !== scriptType) {
        throw new Error(
          `OutPoint scriptType mismatch: expected ${scriptType}, got ${reader.ScriptType}`,
        );
      }

      if (reader.Address && reader.Address.Value !== address.Value) {
        throw new Error(
          `OutPoint address mismatch: expected ${address.Value}, got ${reader.Address.Value}`,
        );
      }
    }
  }

  static fromTransaction = (transaction: Transaction, vout: number) =>
    new OutPointFull(transaction, vout);

  static fromHex = (hex: string, vout: number) =>
    new OutPointFull(TransactionReader.readHex(hex), vout);

  toString = () => `${this.TxId}:${this.Vout}`;

  get LockingScript(): Bytes {
    return this._lockingScript;
  }

  set LockingScript(value: Bytes) {
    this._lockingScript = value;
  }

  // Deprecated typo kept for backward compatibility.
  get LockignScript(): Bytes {
    return this._lockingScript;
  }

  set LockignScript(value: Bytes) {
    this._lockingScript = value;
  }
}

export class OutPointFull extends OutPoint {
  constructor(transaction: Transaction, vout: number) {
    const output = transaction.Outputs[vout];

    if (
      output.ScriptType !== ScriptType.p2pkh &&
      output.ScriptType !== ScriptType.p2mpkh &&
      output.ScriptType !== ScriptType.p2stas &&
      output.ScriptType !== ScriptType.dstas
    )
      throw new Error("p2pkh, p2mpkh, p2stas or dstas output must be provided");

    if (!output.Address) {
      throw new Error(
        "Output does not expose address (for example, DSTAS multisig owner). Build OutPoint manually.",
      );
    }

    super(
      transaction.Id,
      vout,
      output.LockingScript,
      output.Satoshis,
      output.Address,
      output.ScriptType,
    );

    this.Transaction = transaction;
  }
}
