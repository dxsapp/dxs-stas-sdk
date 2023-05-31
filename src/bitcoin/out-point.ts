import { TransactionReader } from "../transaction";
import { Address } from "./address";
import { ScriptType } from "./script-type";
import { Transaction } from "./transaction";

export class OutPoint {
  TxId: string;
  Vout: number;
  LockignScript: Buffer;
  Satoshis: number;
  Address: Address;
  ScriptType: ScriptType;
  Transaction?: Transaction;

  constructor(
    txId: string,
    vout: number,
    lockignScript: Buffer,
    satoshis: number,
    address: Address,
    scriptType: ScriptType
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
      output.ScriptType !== ScriptType.p2stas
    )
      throw new Error("p2pkh or p2stat output must be provided");

    super(
      transaction.Id,
      vout,
      output.LockignScript,
      output.Satoshis,
      output.Address!,
      output.ScriptType
    );

    this.Transaction = transaction;
  }
}
