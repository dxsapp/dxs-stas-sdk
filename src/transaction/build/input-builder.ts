import {
  cloneBytes,
  estimateChunkSize,
  getChunkSize,
  getNumberSize,
  reverseBytes,
  splitBytes,
} from "../../buffer/buffer-utils";
import { ByteWriter } from "../../binary";
import { OpCode } from "../../bitcoin/op-codes";
import { OutPoint } from "../../bitcoin/out-point";
import { PrivateKey } from "../../bitcoin/private-key";
import { ScriptType } from "../../bitcoin/script-type";
import { SignatureHashType } from "../../bitcoin/sig-hash-type";
import { hash256 } from "../../hashes";
import { ScriptBuilder } from "../../script/build/script-builder";
import { TransactionBuilder } from "./transaction-builder";
import { Wallet } from "../../bitcoin";
import { Bytes, fromHex } from "../../bytes";

export class InputBilder {
  protected TxBuilder: TransactionBuilder;
  protected Owner: PrivateKey | Wallet;
  protected Idx: number;

  OutPoint: OutPoint;
  Merge: boolean;
  UnlockingScript?: Bytes;
  Sequence = TransactionBuilder.DefaultSequence;

  private _mergeVout: number = 0;
  private _mergeSegments: Bytes[] = [];

  constructor(
    txBuilder: TransactionBuilder,
    outPoint: OutPoint,
    signer: PrivateKey | Wallet,
    merge: boolean,
  ) {
    this.TxBuilder = txBuilder;
    this.Idx = txBuilder.Inputs.length;
    this.OutPoint = outPoint;
    this.Owner = signer;
    this.Merge = merge;
  }

  sign = () => {
    const preimage = this.preimage(TransactionBuilder.DefaultSighashType);
    const hashedPreimage = hash256(preimage);
    const der = this.Owner.sign(hashedPreimage);
    const derWithSigHashType = new Uint8Array(der.length + 1);
    derWithSigHashType.set(der);
    derWithSigHashType[der.length] = TransactionBuilder.DefaultSighashType;

    if (this.OutPoint.ScriptType === ScriptType.p2pkh) {
      const size =
        getChunkSize(derWithSigHashType) + getChunkSize(this.Owner.PublicKey);
      const buffer = new Uint8Array(size);
      const bufferWriter = new ByteWriter(buffer);

      bufferWriter.writeVarChunk(derWithSigHashType);
      bufferWriter.writeVarChunk(this.Owner.PublicKey);

      this.UnlockingScript = buffer;
    } else if (this.OutPoint.ScriptType === ScriptType.p2stas) {
      this.prepareMergeInfo();

      const script = new ScriptBuilder(ScriptType.p2stas);
      let hasNote = false;

      for (const output of this.TxBuilder.Outputs) {
        if (output.LockingScript.ScriptType === ScriptType.nullData) {
          const nulldata = output.LockingScript.toBytes();
          const payload = nulldata.subarray(2);
          script.addData(payload);

          hasNote = true;
        } else {
          script
            .addNumber(output.Satoshis)
            .addData(output.LockingScript.ToAddress!.Hash160);
        }
      }

      if (!hasNote) script.addOpCode(OpCode.OP_0);

      const fundingInput =
        this.TxBuilder.Inputs[this.TxBuilder.Inputs.length - 1];

      script
        .addNumber(fundingInput.OutPoint.Vout)
        .addData(reverseBytes(fromHex(fundingInput.OutPoint.TxId)));

      if (this.Merge) {
        script
          .addNumber(this._mergeVout)
          .addDatas(this._mergeSegments)
          .addNumber(this._mergeSegments.length);
      } else {
        script.addOpCode(OpCode.OP_0);
      }

      script
        .addData(preimage)
        .addData(derWithSigHashType)
        .addData(this.Owner.PublicKey);

      this.UnlockingScript = script.toBytes();
    }
  };

  writeTo(writer: ByteWriter) {
    writer.writeChunk(reverseBytes(fromHex(this.OutPoint.TxId)));
    writer.writeUInt32(this.OutPoint.Vout);
    writer.writeVarChunk(this.UnlockingScript!);
    writer.writeUInt32(this.Sequence);
  }

  size = () =>
    32 + // TX.Id
    4 + // Vout
    this.unlockingScriptSize() +
    4; // Sequence

  preimageLength = (): number =>
    4 + // Tx version
    32 + // Prevout hash
    32 + // Sequence hash
    32 + // Output Tx id
    4 + // VOUT ;
    getChunkSize(this.OutPoint.LockignScript) +
    8 + // Satoshis
    4 + // Sequence
    32 + // Outputs hash
    4 + // Lock time
    4; // Signature type

  stasNullDataLength = () => {
    const nullDataOutput = this.TxBuilder.Outputs.find(
      (x) => x.LockingScript.ScriptType === ScriptType.nullData,
    );

    if (!nullDataOutput) return 1;

    return estimateChunkSize(nullDataOutput.LockingScript.size() - 2);
  };

  prevoutHashLength = () => (32 + 4) * this.TxBuilder.Inputs.length;

  unlockingScriptSize = (): number => {
    if (this.UnlockingScript !== undefined) {
      return estimateChunkSize(this.UnlockingScript.length);
    }

    let size =
      1 + // OP_PUSH
      73 + // DER-encoded signature (70-73 bytes)
      1 + // OP_PUSH
      33; // Public Key

    if (this.OutPoint.ScriptType === ScriptType.p2stas) {
      this.prepareMergeInfo();

      const fundingIdx = this.TxBuilder.Inputs.length - 1;
      const fundingOutpoint = this.TxBuilder.Inputs[fundingIdx].OutPoint;

      size += this.stasNullDataLength();
      size += this.TxBuilder.Outputs.reduce((a, x) => {
        if (x.LockingScript.ScriptType === ScriptType.nullData) return a;

        return a + getNumberSize(x.Satoshis) + 21;
      }, 0);

      size += getNumberSize(fundingOutpoint.Vout);
      size += estimateChunkSize(32); // Funding Tx vout
      size += estimateChunkSize(this.preimageLength());

      if (!this.Merge) {
        size += 1; // OP_0
      } else {
        size += getNumberSize(this._mergeVout);
        size += getNumberSize(this._mergeSegments.length);
        size += this._mergeSegments.reduce((a, x) => getChunkSize(x) + a, 0);
      }
    }

    return estimateChunkSize(size);
  };

  /// <summary>
  /// SIGHASH_ALL/SINGLE/NONE with FORKID and ANYONECANPAY variants
  /// </summary>
  preimage = (signatureHashType: SignatureHashType) => {
    const size = this.preimageLength();
    const buffer = new Uint8Array(size);
    const writer = new ByteWriter(buffer);
    const baseType = signatureHashType & 0x1f;
    const anyoneCanPay =
      (signatureHashType & SignatureHashType.SIGHASH_ANYONECANPAY) !== 0;

    writer.writeUInt32(this.TxBuilder.Version); // 4

    if (anyoneCanPay) {
      this.writeZeroHash(writer);
    } else {
      this.writePrevoutHash(writer); // 32
    }

    if (
      anyoneCanPay ||
      baseType === SignatureHashType.SIGHASH_NONE ||
      baseType === SignatureHashType.SIGHASH_SINGLE
    ) {
      this.writeZeroHash(writer);
    } else {
      this.writeSequenceHash(writer); // 32
    }

    writer.writeChunk(reverseBytes(fromHex(this.OutPoint.TxId))); // 32
    writer.writeUInt32(this.OutPoint.Vout); // 4
    writer.writeVarChunk(this.OutPoint.LockignScript);
    writer.writeUInt64(this.OutPoint.Satoshis); // 8
    writer.writeUInt32(this.Sequence); // 4

    if (baseType === SignatureHashType.SIGHASH_ALL) {
      this.writeOutputsHash(writer);
    } else if (baseType === SignatureHashType.SIGHASH_SINGLE) {
      this.writeSingleOutputHash(writer);
    } else {
      this.writeZeroHash(writer);
    }

    writer.writeUInt32(this.TxBuilder.LockTime); // 4
    writer.writeUInt32(signatureHashType); // 4

    return buffer;
  };

  private writePrevoutHash = (writer: ByteWriter) => {
    const size = this.prevoutHashLength();
    const buffer = new Uint8Array(size);
    const bufferWriter = new ByteWriter(buffer);

    for (const input of this.TxBuilder.Inputs) {
      bufferWriter.writeChunk(reverseBytes(fromHex(input.OutPoint.TxId)));
      bufferWriter.writeUInt32(input.OutPoint.Vout);
    }

    writer.writeChunk(hash256(buffer));
  };

  private writeSequenceHash = (writer: ByteWriter) => {
    const buffer = new Uint8Array(4 * this.TxBuilder.Inputs.length);
    const bufferWriter = new ByteWriter(buffer);

    for (const input of this.TxBuilder.Inputs)
      bufferWriter.writeUInt32(input.Sequence);

    writer.writeChunk(hash256(buffer));
  };

  private writeOutputsHash = (writer: ByteWriter) => {
    const size = this.TxBuilder.Outputs.reduce((a, x) => a + x.size(), 0);

    const buffer = new Uint8Array(size);
    const bufferWriter = new ByteWriter(buffer);

    for (const output of this.TxBuilder.Outputs) {
      bufferWriter.writeUInt64(output.Satoshis);
      bufferWriter.writeVarChunk(output.LockingScript.toBytes());
    }

    writer.writeChunk(hash256(buffer));
  };

  private writeSingleOutputHash = (writer: ByteWriter) => {
    if (this.Idx >= this.TxBuilder.Outputs.length) {
      this.writeZeroHash(writer);
      return;
    }

    const output = this.TxBuilder.Outputs[this.Idx];
    const buffer = new Uint8Array(output.size());
    const bufferWriter = new ByteWriter(buffer);

    output.writeTo(bufferWriter);
    writer.writeChunk(hash256(buffer));
  };

  private writeZeroHash = (writer: ByteWriter) => {
    writer.writeChunk(new Uint8Array(32));
  };

  private prepareMergeInfo = () => {
    if (!this.Merge || this._mergeSegments.length > 0) return;

    const lockingScript = this.TxBuilder.Inputs[0].OutPoint.LockignScript;
    const scriptToCut = cloneBytes(lockingScript, 0, 23);
    const mergeUtxo = this.TxBuilder.Inputs[this.Idx === 0 ? 1 : 0];

    this._mergeVout = mergeUtxo.OutPoint.Vout;
    this._mergeSegments = splitBytes(
      mergeUtxo.OutPoint.Transaction!.Raw,
      scriptToCut,
    ).reverse();
  };
}
