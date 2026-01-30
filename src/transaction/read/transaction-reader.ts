import { ByteReader } from "../../binary";
import { reverseBytes } from "../../buffer/buffer-utils";
import { Bytes, fromHex, toHex } from "../../bytes";
import { Transaction } from "../../bitcoin/transaction";
import { TransactionInput } from "../../bitcoin/transaction-input";
import { TransactionOutput } from "../../bitcoin/transaction-output";

export class TransactionReader {
  static readHex = (raw: string) =>
    TransactionReader.readBytes(fromHex(raw));

  static readBytes = (buffer: Bytes) => {
    const reader = new ByteReader(buffer);

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

  static readInput = (reader: ByteReader): TransactionInput => {
    const txId = reverseBytes(reader.readChunk(32));
    const vout = reader.readUInt32();
    const unlockingScript = reader.readVarChunk();
    const sequence = reader.readUInt32();

    return new TransactionInput(
      toHex(txId),
      vout,
      unlockingScript,
      sequence
    );
  };

  static readOutput = (reader: ByteReader): TransactionOutput => {
    const satoshis = reader.readUInt64();
    const lockignScript = reader.readVarChunk();

    return new TransactionOutput(satoshis, lockignScript);
  };
}
