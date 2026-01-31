import { reverseBytes } from "../buffer/buffer-utils";
import { Bytes, toHex } from "../bytes";
import { hash256 } from "../hashes";
import { TransactionInput } from "./transaction-input";
import { TransactionOutput } from "./transaction-output";

export class Transaction {
  Inputs: TransactionInput[];
  Outputs: TransactionOutput[];
  Version: number;
  LockTime: number;
  Raw: Bytes;
  Hex: string;
  Id: string;

  constructor(
    raw: Bytes,
    inputs: TransactionInput[],
    outputs: TransactionOutput[],
    version: number,
    lockTime: number,
  ) {
    this.Inputs = inputs;
    this.Outputs = outputs;
    this.Version = version;
    this.LockTime = lockTime;

    this.Raw = raw;
    this.Hex = toHex(raw);
    this.Id = toHex(reverseBytes(hash256(raw)));
  }
}
