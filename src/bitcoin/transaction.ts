import { reverseBuffer } from "../buffer/buffer-utils";
import { hash256 } from "../hashes";
import { TransactionInput } from "./transaction-input";
import { TransactionOutput } from "./transaction-output";

export class Transaction {
  Inputs: TransactionInput[];
  Outputs: TransactionOutput[];
  Version: number;
  LockTime: number;
  Raw: Buffer;
  Hex: string;
  Id: string;

  constructor(
    raw: Buffer,
    inputs: TransactionInput[],
    outputs: TransactionOutput[],
    version: number,
    lockTime: number
  ) {
    this.Inputs = inputs;
    this.Outputs = outputs;
    this.Version = version;
    this.LockTime = lockTime;

    this.Raw = raw;
    this.Hex = raw.toString("hex");
    this.Id = reverseBuffer(hash256(raw)).toString("hex");
  }
}
