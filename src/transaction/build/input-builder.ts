import {
  cloneBuffer,
  estimateChunkSize,
  getChunkSize,
  getNumberSize,
  reverseBuffer,
  splitBuffer,
} from "../../buffer/buffer-utils";
import { BufferWriter } from "../../buffer/buffer-writer";
import { OpCode } from "../../bitcoin/op-codes";
import { OutPoint } from "../../bitcoin/out-point";
import { PrivateKey } from "../../bitcoin/private-key";
import { ScriptType } from "../../bitcoin/script-type";
import { SignatureHashType } from "../../bitcoin/sig-hash-type";
import { hash256 } from "../../hashes";
import { ScriptBuilder } from "../../script/build/script-builder";
import { TransactionBuilder } from "./transaction-builder";
import { Wallet } from "../../bitcoin";

export class InputBilder {
  protected TxBuilder: TransactionBuilder;
  protected Owner: PrivateKey | Wallet;
  protected Idx: number;

  OutPoint: OutPoint;
  Merge: Boolean;
  UnlockingScript?: Buffer;
  Sequence = TransactionBuilder.DefaultSequence;

  private _mergeVout: number = 0;
  private _mergeSegments: Buffer[] = [];

  constructor(
    txBuilder: TransactionBuilder,
    outPoint: OutPoint,
    signer: PrivateKey | Wallet,
    merge: boolean
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
    const derWithSigHashType = Buffer.alloc(der.length + 1);

    der.copy(derWithSigHashType);
    derWithSigHashType.writeInt8(
      TransactionBuilder.DefaultSighashType,
      der.length
    );

    if (this.OutPoint.ScriptType === ScriptType.p2pkh) {
      const size =
        getChunkSize(derWithSigHashType) + getChunkSize(this.Owner.PublicKey);
      const buffer = Buffer.alloc(size);
      const bufferWriter = new BufferWriter(buffer);

      bufferWriter.writeVarChunk(derWithSigHashType);
      bufferWriter.writeVarChunk(this.Owner.PublicKey);

      this.UnlockingScript = buffer;
    } else if (this.OutPoint.ScriptType === ScriptType.p2stas) {
      this.prepareMergeInfo();

      const script = new ScriptBuilder(ScriptType.p2stas);
      let hasNote = false;

      for (const output of this.TxBuilder.Outputs) {
        if (output.LockingScript.ScriptType === ScriptType.nullData) {
          const nulldata = output.LockingScript.toBuffer();
          const payload = Buffer.alloc(nulldata.length - 2);

          nulldata.copy(payload, 0, 2);
          script.addData(payload);

          hasNote = true;
        } else {
          script
            .addNumber(output.Satoshis)
            .addData(output.LockingScript.ToAddress!.Hash160);
        }
      }

      if (!hasNote) script.addOpCode(OpCode.OP_0);

      var fundingInput =
        this.TxBuilder.Inputs[this.TxBuilder.Inputs.length - 1];

      script
        .addNumber(fundingInput.OutPoint.Vout)
        .addData(reverseBuffer(Buffer.from(fundingInput.OutPoint.TxId, "hex")));

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

      this.UnlockingScript = script.toBuffer();
    }
  };

  writeTo(bufferWriter: BufferWriter) {
    bufferWriter.writeChunk(
      reverseBuffer(Buffer.from(this.OutPoint.TxId, "hex"))
    );
    bufferWriter.writeUInt32(this.OutPoint.Vout);
    bufferWriter.writeVarChunk(this.UnlockingScript!);
    bufferWriter.writeUInt32(this.Sequence);
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
    32 + //Outputs hash
    4 + // Lock time
    4; // Signature type

  stasNullDataLength = () => {
    const nullDataOutput = this.TxBuilder.Outputs.find(
      (x) => x.LockingScript.ScriptType === ScriptType.nullData
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
  /// Only SIGHASH_ALL|FORK_ID implemented
  /// </summary>
  preimage = (signatureHashType: SignatureHashType) => {
    const size = this.preimageLength();
    const buffer = Buffer.alloc(size);
    var writer = new BufferWriter(buffer);

    writer.writeUInt32(this.TxBuilder.Version); // 4
    this.writePrevoutHash(writer); // 32
    this.writeSequenceHash(writer); // 32
    writer.writeChunk(reverseBuffer(Buffer.from(this.OutPoint.TxId, "hex"))); // 32
    writer.writeUInt32(this.OutPoint.Vout); // 4
    writer.writeVarChunk(this.OutPoint.LockignScript);
    writer.writeUInt64(this.OutPoint.Satoshis); // 8
    writer.writeUInt32(this.Sequence); // 4
    this.writeOutputsHash(writer); // 32
    writer.writeUInt32(this.TxBuilder.LockTime); // 4
    writer.writeUInt32(signatureHashType); // 4

    return buffer;
  };

  private writePrevoutHash = (bufferWriter: BufferWriter) => {
    const size = this.prevoutHashLength();
    const buffer = Buffer.alloc(size);
    const writer = new BufferWriter(buffer);

    for (const input of this.TxBuilder.Inputs) {
      writer.writeChunk(reverseBuffer(Buffer.from(input.OutPoint.TxId, "hex")));
      writer.writeUInt32(input.OutPoint.Vout);
    }

    bufferWriter.writeChunk(hash256(buffer));
  };

  private writeSequenceHash = (bufferWriter: BufferWriter) => {
    const buffer = Buffer.alloc(4 * this.TxBuilder.Inputs.length);
    const writer = new BufferWriter(buffer);

    for (const input of this.TxBuilder.Inputs)
      writer.writeUInt32(input.Sequence);

    bufferWriter.writeChunk(hash256(buffer));
  };

  private writeOutputsHash = (bufferWriter: BufferWriter) => {
    var size = this.TxBuilder.Outputs.reduce((a, x) => a + x.size(), 0);

    const buffer = Buffer.alloc(size);
    const writer = new BufferWriter(buffer);

    for (const output of this.TxBuilder.Outputs) {
      writer.writeUInt64(output.Satoshis);
      writer.writeVarChunk(output.LockingScript.toBuffer());
    }

    bufferWriter.writeChunk(hash256(buffer));
  };

  private prepareMergeInfo = () => {
    if (!this.Merge || this._mergeSegments.length > 0) return;

    const lockingScript = this.TxBuilder.Inputs[0].OutPoint.LockignScript;
    const scriptToCut = cloneBuffer(lockingScript, 0, 23);
    const mergeUtxo = this.TxBuilder.Inputs[this.Idx === 0 ? 1 : 0];

    this._mergeVout = mergeUtxo.OutPoint.Vout;
    this._mergeSegments = splitBuffer(
      mergeUtxo.OutPoint.Transaction!.Raw,
      scriptToCut
    ).reverse();
  };
}
