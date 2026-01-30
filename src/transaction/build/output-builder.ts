import { estimateChunkSize } from "../../buffer/buffer-utils";
import { ByteWriter } from "../../binary";
import { ScriptBuilder } from "../../script/build/script-builder";

export class OutputBuilder {
  Satoshis: number;
  LockingScript: ScriptBuilder;

  constructor(lockingScript: ScriptBuilder, satoshis: number) {
    this.LockingScript = lockingScript;
    this.Satoshis = satoshis;
  }

  size() {
    return (
      8 + // satoshis Size, always 8 bytes
      estimateChunkSize(this.LockingScript.size())
    );
  }

  writeTo(writer: ByteWriter) {
    writer.writeUInt64(this.Satoshis);
    writer.writeVarChunk(this.LockingScript.toBytes());
  }
}
