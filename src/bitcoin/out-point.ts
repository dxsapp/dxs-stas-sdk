import { TransactionReader } from "../transaction";
import { Address } from "./address";
import { ScriptType } from "./script-type";
import { Transaction } from "./transaction";
import { Bytes } from "../bytes";

export class OutPoint {
  TxId: string;
  Vout: number;
  LockignScript: Bytes;
  Satoshis: number;
  Address: Address;
  ScriptType: ScriptType;
  Transaction?: Transaction;

  constructor(
    txId: string,
    vout: number,
    lockignScript: Bytes,
    satoshis: number,
    address: Address,
    scriptType: ScriptType,
  ) {
    this.TxId = txId;
    this.Vout = vout;
    this.LockignScript = lockignScript;
    this.Satoshis = satoshis;
    this.Address = address;
    this.ScriptType = scriptType;
  }

  static fromTransaction = (transaction: Transaction, vout: number) =>
    new OutPointFull(transaction, vout);

  static fromHex = (hex: string, vout: number) =>
    new OutPointFull(TransactionReader.readHex(hex), vout);

  toString = () => `${this.TxId}:${this.Vout}`;
}

export class OutPointFull extends OutPoint {
  constructor(transaction: Transaction, vout: number) {
    const output = transaction.Outputs[vout];

    if (
      output.ScriptType !== ScriptType.p2pkh &&
      output.ScriptType !== ScriptType.p2mpkh &&
      output.ScriptType !== ScriptType.p2stas &&
      output.ScriptType !== ScriptType.p2stas30
    )
      throw new Error(
        "p2pkh, p2mpkh, p2stas or p2stas30 output must be provided",
      );

    super(
      transaction.Id,
      vout,
      output.LockignScript,
      output.Satoshis,
      output.Address!,
      output.ScriptType,
    );

    this.Transaction = transaction;
  }
}
