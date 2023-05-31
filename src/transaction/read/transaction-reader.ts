import { BufferReader } from "../../buffer/buffer-reader";
import { reverseBuffer } from "../../buffer/buffer-utils";
import { Transaction } from "../../bitcoin/transaction";
import { TransactionInput } from "../../bitcoin/transaction-input";
import { TransactionOutput } from "../../bitcoin/transaction-output";

export class TransactionReader {
  static readHex = (raw: string) =>
    TransactionReader.readBuffer(Buffer.from(raw, "hex"));

  static readBuffer = (buffer: Buffer) => {
    const reader = new BufferReader(buffer);

    const version = reader.readUInt32();
    const inputCount = reader.readVarInt();
    const inputs = [];

    for (let i = 0; i < inputCount; i++) {
      inputs.push(TransactionReader.readInput(reader));
    }

    const outputCount = reader.readVarInt();
    const outputs = [];

    for (let i = 0; i < outputCount; i++) {
      outputs.push(TransactionReader.readOutput(reader));
    }

    const lockTime = reader.readUInt32();

    return new Transaction(buffer, inputs, outputs, version, lockTime);
  };

  static readInput = (reader: BufferReader): TransactionInput => {
    const txId = reverseBuffer(reader.readChunk(32));
    const vout = reader.readUInt32();
    const unlockingScript = reader.readVarChunk();
    const sequence = reader.readUInt32();

    return new TransactionInput(
      txId.toString("hex"),
      vout,
      unlockingScript,
      sequence
    );
  };

  static readOutput = (reader: BufferReader): TransactionOutput => {
    const satoshis = reader.readUInt64();
    const lockignScript = reader.readVarChunk();

    return new TransactionOutput(satoshis, lockignScript);
  };
}
