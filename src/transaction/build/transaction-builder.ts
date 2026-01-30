import { getVarIntLength } from "../../buffer/buffer-utils";
import { ByteWriter } from "../../binary";
import { Address } from "../../bitcoin/address";
import { OpCode } from "../../bitcoin/op-codes";
import { OutPoint } from "../../bitcoin/out-point";
import { PrivateKey } from "../../bitcoin/private-key";
import { SignatureHashType } from "../../bitcoin/sig-hash-type";
import { TokenScheme } from "../../bitcoin/token-scheme";
import { NullDataBuilder } from "../../script/build/null-data-builder";
import { P2pkhBuilder } from "../../script/build/p2pkh-builder";
import { P2stasBuilder } from "../../script/build/p2stas-builder";
import { ScriptReader } from "../../script/read/script-reader";
import { InputBilder } from "./input-builder";
import { OutputBuilder } from "./output-builder";
import { Wallet } from "../../bitcoin";
import { Bytes, bytesToUtf8, toHex } from "../../bytes";

export class TransactionBuilderError extends Error {
  constructor(message: string, public devMessage: string) {
    super(message);
  }
}

export class TransactionBuilder {
  static DefaultSequence = 0xffffffff;
  static DefaultSighashType =
    SignatureHashType.SIGHASH_ALL | SignatureHashType.SIGHASH_FORKID;

  Inputs: InputBilder[] = [];
  Outputs: OutputBuilder[] = [];

  Version = 1;
  LockTime = 0;

  static init = () => new TransactionBuilder();

  size = () =>
    4 + // version
    4 + // locktime
    getVarIntLength(this.Inputs.length) +
    this.Inputs.reduce((a, x) => a + x.size(), 0) +
    getVarIntLength(this.Outputs.length) +
    this.Outputs.reduce((a, x) => a + x.size(), 0);

  getFee = (satoshisPerByte: number) =>
    Math.ceil(this.size() * satoshisPerByte);

  addInput = (outPoint: OutPoint, signer: PrivateKey | Wallet) => {
    this.Inputs.push(new InputBilder(this, outPoint, signer, false));

    return this;
  };

  addStasMergeInput = (outPoint: OutPoint, signer: PrivateKey | Wallet) => {
    this.Inputs.push(new InputBilder(this, outPoint, signer, true));

    return this;
  };

  addP2PkhOutput = (value: number, to: Address, data: Bytes[] = []) => {
    const script = new P2pkhBuilder(to);

    for (const d of data) {
      script.addReturnData(d);
    }

    this.Outputs.push(new OutputBuilder(script, value));

    return this;
  };

  addNullDataOutput(data: Bytes[]) {
    const script = new NullDataBuilder(data);

    this.Outputs.push(new OutputBuilder(script, 0));

    return this;
  }

  addChangeOutputWithFee(
    to: Address,
    change: number,
    satoshisPerByte: number,
    idx: number | null = null
  ) {
    const script = new P2pkhBuilder(to);
    const output = new OutputBuilder(script, change);

    if (idx !== null) this.Outputs.splice(idx, 0, output);
    else this.Outputs.push(output);

    let fee = this.getFee(satoshisPerByte);

    if (fee >= change)
      throw new TransactionBuilderError(
        `Insufficient satoshis to pay fee`,
        `Insufficient satoshis to pay fee. Change: ${change}; Fee: ${fee}`
      );

    output.Satoshis = change - fee;

    return this;
  }

  addStasOutputByScheme = (
    schema: TokenScheme,
    satoshis: number,
    to: Address,
    data: Bytes[] = []
  ) => {
    const script = new P2stasBuilder(to, schema.TokenId, schema.Symbol);

    for (const d of data) {
      script.addData(d);
    }

    this.Outputs.push(new OutputBuilder(script, satoshis));

    return this;
  };

  addStasOutputByPrevLockingScript = (
    satoshis: number,
    to: Address,
    prevStasLockingScript: Bytes
  ) => {
    const prevScriptTokens = ScriptReader.read(prevStasLockingScript);
    const opReturnIdx = prevScriptTokens.findIndex(
      (x) => x.OpCodeNum === OpCode.OP_RETURN
    );

    const toknenId = toHex(prevScriptTokens[opReturnIdx + 1].Data!);
    const symbol = bytesToUtf8(prevScriptTokens[opReturnIdx + 2].Data!);
    const data: Bytes[] = [];

    for (let i = opReturnIdx + 3; i < prevScriptTokens.length; i++) {
      data.push(prevScriptTokens[i].Data!);
    }

    const script = new P2stasBuilder(to, toknenId, symbol, data);

    this.Outputs.push(new OutputBuilder(script, satoshis));

    return this;
  };

  sign = () => {
    for (const input of this.Inputs) {
      input.sign();
    }

    return this;
  };

  toBytes = () => {
    const size = this.size();
    const buffer = new Uint8Array(size);
    const bufferWriter = new ByteWriter(buffer);

    bufferWriter.writeUInt32(this.Version);

    bufferWriter.writeVarInt(this.Inputs.length);
    for (const input of this.Inputs) input.writeTo(bufferWriter);

    bufferWriter.writeVarInt(this.Outputs.length);
    for (const output of this.Outputs) output.writeTo(bufferWriter);

    bufferWriter.writeUInt32(this.LockTime);

    return buffer;
  };

  toHex = () => toHex(this.toBytes());
}
