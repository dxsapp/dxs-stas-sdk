import { Signature, verify as nobleVerify } from "@noble/secp256k1";
import { ByteWriter } from "../../binary";
import {
  cloneBytes,
  estimateChunkSize,
  getChunkSize,
  reverseBytes,
} from "../../buffer/buffer-utils";
import { SignatureHashType } from "../../bitcoin/sig-hash-type";
import { Transaction } from "../../bitcoin/transaction";
import { TransactionOutput } from "../../bitcoin/transaction-output";
import { OpCode } from "../../bitcoin/op-codes";
import { Bytes, concat, equal, fromHex, toHex } from "../../bytes";
import { hash160, hash256, ripemd160, sha256 } from "../../hashes";

export type PrevOutput = {
  lockingScript: Bytes;
  satoshis: number;
};

export type ScriptEvalContext = {
  tx: Transaction;
  inputIndex: number;
  prevOutputs: PrevOutput[];
};

export type ScriptEvalResult = {
  success: boolean;
  error?: string;
  stack: Bytes[];
  altStack: Bytes[];
};

export type ScriptEvalOptions = {
  allowOpReturn?: boolean;
};

class ScriptEvalError extends Error {
  constructor(message: string) {
    super(message);
  }
}

const isTruthy = (value: Bytes): boolean => {
  for (let i = 0; i < value.length; i++) {
    if (value[i] !== 0) {
      if (i === value.length - 1 && value[i] === 0x80) return false;
      return true;
    }
  }
  return false;
};

const decodeScriptNum = (value: Bytes): bigint => {
  if (value.length === 0) return BigInt(0);

  let result = BigInt(0);
  for (let i = 0; i < value.length; i++) {
    result |= BigInt(value[i]) << BigInt(8 * i);
  }

  const signBit = BigInt(1) << BigInt(8 * value.length - 1);
  const isNegative = (result & signBit) !== BigInt(0);
  if (isNegative) {
    result &= signBit - BigInt(1);
    return -result;
  }

  return result;
};

const encodeScriptNum = (value: bigint): Bytes => {
  if (value === BigInt(0)) return new Uint8Array();

  const neg = value < BigInt(0);
  let absValue = neg ? -value : value;
  const result: number[] = [];

  while (absValue > BigInt(0)) {
    result.push(Number(absValue & BigInt(0xff)));
    absValue >>= BigInt(8);
  }

  if ((result[result.length - 1] & 0x80) !== 0) {
    result.push(neg ? 0x80 : 0x00);
  } else if (neg) {
    result[result.length - 1] |= 0x80;
  }

  return new Uint8Array(result);
};

const toBigInt = (value: Bytes): bigint => decodeScriptNum(value);
const fromBigInt = (value: bigint): Bytes => encodeScriptNum(value);

const pushBool = (stack: Bytes[], value: boolean) => {
  stack.push(value ? new Uint8Array([1]) : new Uint8Array());
};

const decodePushData = (script: Bytes, offset: number) => {
  const opcode = script[offset];

  if (opcode >= 1 && opcode <= 75) {
    const size = opcode;
    const start = offset + 1;
    const end = start + size;
    if (end > script.length) throw new ScriptEvalError("Push out of bounds");
    return { opcode, data: script.subarray(start, end), next: end };
  }

  if (opcode === OpCode.OP_PUSHDATA1) {
    if (offset + 2 > script.length)
      throw new ScriptEvalError("Pushdata1 out of bounds");
    const size = script[offset + 1];
    const start = offset + 2;
    const end = start + size;
    if (end > script.length) throw new ScriptEvalError("Push out of bounds");
    return { opcode, data: script.subarray(start, end), next: end };
  }

  if (opcode === OpCode.OP_PUSHDATA2) {
    if (offset + 3 > script.length)
      throw new ScriptEvalError("Pushdata2 out of bounds");
    const size = script[offset + 1] | (script[offset + 2] << 8);
    const start = offset + 3;
    const end = start + size;
    if (end > script.length) throw new ScriptEvalError("Push out of bounds");
    return { opcode, data: script.subarray(start, end), next: end };
  }

  if (opcode === OpCode.OP_PUSHDATA4) {
    if (offset + 5 > script.length)
      throw new ScriptEvalError("Pushdata4 out of bounds");
    const size =
      (script[offset + 1] |
        (script[offset + 2] << 8) |
        (script[offset + 3] << 16) |
        (script[offset + 4] << 24)) >>>
      0;
    const start = offset + 5;
    const end = start + size;
    if (end > script.length) throw new ScriptEvalError("Push out of bounds");
    return { opcode, data: script.subarray(start, end), next: end };
  }

  return { opcode, data: undefined, next: offset + 1 };
};

const stripCodeSeparators = (script: Bytes): Bytes => {
  const parts: Bytes[] = [];
  let i = 0;

  while (i < script.length) {
    const { opcode, data, next } = decodePushData(script, i);
    if (data !== undefined) {
      parts.push(script.subarray(i, next));
    } else if (opcode !== OpCode.OP_CODESEPARATOR) {
      parts.push(script.subarray(i, next));
    }
    i = next;
  }

  return concat(parts);
};

const derDecodeSignature = (der: Bytes) => {
  if (der.length < 8 || der[0] !== 0x30) {
    throw new ScriptEvalError("Invalid DER signature");
  }

  const totalLen = der[1];
  if (totalLen + 2 !== der.length) {
    throw new ScriptEvalError("Invalid DER signature length");
  }

  let offset = 2;
  if (der[offset++] !== 0x02) throw new ScriptEvalError("Invalid DER signature");
  const rLen = der[offset++];
  const r = der.subarray(offset, offset + rLen);
  offset += rLen;

  if (der[offset++] !== 0x02) throw new ScriptEvalError("Invalid DER signature");
  const sLen = der[offset++];
  const s = der.subarray(offset, offset + sLen);

  const bytesToBigInt = (bytes: Bytes) => {
    let result = BigInt(0);
    for (const byte of bytes) {
      result = (result << BigInt(8)) + BigInt(byte);
    }
    return result;
  };

  return new Signature(bytesToBigInt(r), bytesToBigInt(s));
};

const parseSignature = (sigWithHashType: Bytes) => {
  if (sigWithHashType.length === 0) {
    return { signature: new Uint8Array(), sighashType: 0 };
  }

  const sighashType = sigWithHashType[sigWithHashType.length - 1];
  const signature = sigWithHashType.subarray(0, sigWithHashType.length - 1);

  if (signature.length === 0) {
    return { signature: new Uint8Array(), sighashType };
  }

  const sigBytes =
    signature[0] === 0x30
      ? derDecodeSignature(signature).toBytes()
      : signature;

  return { signature: sigBytes, sighashType };
};

const writeOutputTo = (writer: ByteWriter, output: TransactionOutput) => {
  writer.writeUInt64(output.Satoshis);
  writer.writeVarChunk(output.LockignScript);
};

const outputSize = (output: TransactionOutput) =>
  8 + estimateChunkSize(output.LockignScript.length);

const buildSighashPreimage = (
  ctx: ScriptEvalContext,
  scriptCode: Bytes,
  sighashType: number,
) => {
  const tx = ctx.tx;
  const inputIdx = ctx.inputIndex;
  const baseType = sighashType & 0x1f;
  const anyoneCanPay =
    (sighashType & SignatureHashType.SIGHASH_ANYONECANPAY) !== 0;

  const prevoutHash = anyoneCanPay
    ? new Uint8Array(32)
    : hash256(
        concat(
          tx.Inputs.map((input) =>
            concat([
              reverseBytes(fromHex(input.TxId)),
              new Uint8Array([
                input.Vout & 0xff,
                (input.Vout >> 8) & 0xff,
                (input.Vout >> 16) & 0xff,
                (input.Vout >> 24) & 0xff,
              ]),
            ]),
          ),
        ),
      );

  const sequenceHash =
    anyoneCanPay ||
    baseType === SignatureHashType.SIGHASH_NONE ||
    baseType === SignatureHashType.SIGHASH_SINGLE
      ? new Uint8Array(32)
      : hash256(
          concat(
            tx.Inputs.map((input) =>
              new Uint8Array([
                input.Sequence & 0xff,
                (input.Sequence >> 8) & 0xff,
                (input.Sequence >> 16) & 0xff,
                (input.Sequence >> 24) & 0xff,
              ]),
            ),
          ),
        );

  let outputsHash = new Uint8Array(32);
  if (baseType === SignatureHashType.SIGHASH_ALL) {
    const size = tx.Outputs.reduce((sum, out) => sum + outputSize(out), 0);
    const buffer = new Uint8Array(size);
    const writer = new ByteWriter(buffer);
    for (const output of tx.Outputs) writeOutputTo(writer, output);
    outputsHash = hash256(buffer);
  } else if (baseType === SignatureHashType.SIGHASH_SINGLE) {
    if (inputIdx < tx.Outputs.length) {
      const output = tx.Outputs[inputIdx];
      const buffer = new Uint8Array(outputSize(output));
      const writer = new ByteWriter(buffer);
      writeOutputTo(writer, output);
      outputsHash = hash256(buffer);
    }
  }

  const prevOutput = ctx.prevOutputs[inputIdx];
  if (!prevOutput)
    throw new ScriptEvalError("Missing prev output for input");

  const scriptChunk = stripCodeSeparators(scriptCode);
  const size =
    4 +
    32 +
    32 +
    32 +
    4 +
    getChunkSize(scriptChunk) +
    8 +
    4 +
    32 +
    4 +
    4;

  const buffer = new Uint8Array(size);
  const writer = new ByteWriter(buffer);

  writer.writeUInt32(tx.Version);
  writer.writeChunk(prevoutHash);
  writer.writeChunk(sequenceHash);
  writer.writeChunk(reverseBytes(fromHex(tx.Inputs[inputIdx].TxId)));
  writer.writeUInt32(tx.Inputs[inputIdx].Vout);
  writer.writeVarChunk(scriptChunk);
  writer.writeUInt64(prevOutput.satoshis);
  writer.writeUInt32(tx.Inputs[inputIdx].Sequence);
  writer.writeChunk(outputsHash);
  writer.writeUInt32(tx.LockTime);
  writer.writeUInt32(sighashType >>> 0);

  return buffer;
};

class ScriptInterpreter {
  private stack: Bytes[] = [];
  private altStack: Bytes[] = [];
  private execStack: boolean[] = [];
  private script: Bytes = new Uint8Array();
  private codeSeparator = -1;
  private ctx: ScriptEvalContext;
  private allowOpReturn: boolean;

  constructor(ctx: ScriptEvalContext, options?: ScriptEvalOptions) {
    this.ctx = ctx;
    this.allowOpReturn = options?.allowOpReturn === true;
  }

  getStack = () => this.stack;
  getAltStack = () => this.altStack;

  private isExecuting = () => this.execStack.every((v) => v);

  private pop = (): Bytes => {
    if (this.stack.length === 0)
      throw new ScriptEvalError("Stack underflow");
    return this.stack.pop()!;
  };

  private popNum = (): bigint => decodeScriptNum(this.pop());

  private popBool = (): boolean => isTruthy(this.pop());

  private push = (value: Bytes) => this.stack.push(value);

  private top = (): Bytes => {
    if (this.stack.length === 0)
      throw new ScriptEvalError("Stack underflow");
    return this.stack[this.stack.length - 1];
  };

  private getScriptCode = () => {
    const start = this.codeSeparator + 1;
    return this.script.subarray(start);
  };

  execute = (script: Bytes) => {
    this.script = script;
    this.codeSeparator = -1;

    let pc = 0;

    while (pc < script.length) {
      const { opcode, data, next } = decodePushData(script, pc);
      const executing = this.isExecuting();

      if (data !== undefined) {
        if (executing) this.push(data);
        pc = next;
        continue;
      }

      if (!executing) {
        if (
          opcode === OpCode.OP_IF ||
          opcode === OpCode.OP_NOTIF ||
          opcode === OpCode.OP_ELSE ||
          opcode === OpCode.OP_ENDIF
        ) {
          this.execControl(opcode);
        }
        pc = next;
        continue;
      }

      const halt = this.execOp(opcode, pc);
      if (halt) break;
      pc = next;
    }

    if (this.execStack.length !== 0)
      throw new ScriptEvalError("Unbalanced conditional");
  };

  private execControl = (opcode: number) => {
    if (opcode === OpCode.OP_IF || opcode === OpCode.OP_NOTIF) {
      if (this.isExecuting()) {
        const cond = this.popBool();
        this.execStack.push(opcode === OpCode.OP_IF ? cond : !cond);
      } else {
        this.execStack.push(false);
      }
      return;
    }

    if (opcode === OpCode.OP_ELSE) {
      if (this.execStack.length === 0)
        throw new ScriptEvalError("OP_ELSE without OP_IF");

      const parentExec = this.execStack
        .slice(0, this.execStack.length - 1)
        .every((v) => v);

      if (parentExec) {
        this.execStack[this.execStack.length - 1] =
          !this.execStack[this.execStack.length - 1];
      }
      return;
    }

    if (opcode === OpCode.OP_ENDIF) {
      if (this.execStack.length === 0)
        throw new ScriptEvalError("OP_ENDIF without OP_IF");
      this.execStack.pop();
    }
  };

  private execOp = (opcode: number, pc: number): boolean | void => {
    switch (opcode) {
      case OpCode.OP_0:
        this.push(new Uint8Array());
        return;
      case OpCode.OP_1NEGATE:
        this.push(fromBigInt(BigInt(-1)));
        return;
      case OpCode.OP_1:
      case OpCode.OP_2:
      case OpCode.OP_3:
      case OpCode.OP_4:
      case OpCode.OP_5:
      case OpCode.OP_6:
      case OpCode.OP_7:
      case OpCode.OP_8:
      case OpCode.OP_9:
      case OpCode.OP_10:
      case OpCode.OP_11:
      case OpCode.OP_12:
      case OpCode.OP_13:
      case OpCode.OP_14:
      case OpCode.OP_15:
      case OpCode.OP_16:
        this.push(fromBigInt(BigInt(opcode - OpCode.OP_1 + 1)));
        return;

      case OpCode.OP_NOP:
      case OpCode.OP_NOP1:
      case OpCode.OP_NOP4:
      case OpCode.OP_NOP5:
      case OpCode.OP_NOP6:
      case OpCode.OP_NOP7:
      case OpCode.OP_NOP8:
      case OpCode.OP_NOP9:
      case OpCode.OP_NOP10:
        return;

      case OpCode.OP_VERIFY: {
        const ok = this.popBool();
        if (!ok) throw new ScriptEvalError("OP_VERIFY failed");
        return;
      }

      case OpCode.OP_RETURN:
        if (this.allowOpReturn) return true;
        throw new ScriptEvalError("OP_RETURN");

      case OpCode.OP_IF:
      case OpCode.OP_NOTIF:
      case OpCode.OP_ELSE:
      case OpCode.OP_ENDIF:
        return this.execControl(opcode);

      case OpCode.OP_TOALTSTACK:
        this.altStack.push(this.pop());
        return;
      case OpCode.OP_FROMALTSTACK:
        if (this.altStack.length === 0)
          throw new ScriptEvalError("Alt stack underflow");
        this.push(this.altStack.pop()!);
        return;
      case OpCode.OP_2DROP:
        this.pop();
        this.pop();
        return;
      case OpCode.OP_2DUP: {
        const a = this.pop();
        const b = this.pop();
        this.push(b);
        this.push(a);
        this.push(cloneBytes(b));
        this.push(cloneBytes(a));
        return;
      }
      case OpCode.OP_3DUP: {
        const a = this.pop();
        const b = this.pop();
        const c = this.pop();
        this.push(c);
        this.push(b);
        this.push(a);
        this.push(cloneBytes(c));
        this.push(cloneBytes(b));
        this.push(cloneBytes(a));
        return;
      }
      case OpCode.OP_2OVER: {
        if (this.stack.length < 4)
          throw new ScriptEvalError("Stack underflow");
        this.push(cloneBytes(this.stack[this.stack.length - 4]));
        this.push(cloneBytes(this.stack[this.stack.length - 3]));
        return;
      }
      case OpCode.OP_2ROT: {
        if (this.stack.length < 6)
          throw new ScriptEvalError("Stack underflow");
        const a = this.stack.splice(this.stack.length - 6, 2);
        this.stack.push(a[0], a[1]);
        return;
      }
      case OpCode.OP_2SWAP: {
        if (this.stack.length < 4)
          throw new ScriptEvalError("Stack underflow");
        const a = this.stack.splice(this.stack.length - 4, 2);
        this.stack.push(a[0], a[1]);
        return;
      }
      case OpCode.OP_IFDUP: {
        if (this.stack.length === 0)
          throw new ScriptEvalError("Stack underflow");
        if (isTruthy(this.top())) this.push(cloneBytes(this.top()));
        return;
      }
      case OpCode.OP_DEPTH:
        this.push(fromBigInt(BigInt(this.stack.length)));
        return;
      case OpCode.OP_DROP:
        this.pop();
        return;
      case OpCode.OP_DUP:
        this.push(cloneBytes(this.top()));
        return;
      case OpCode.OP_NIP: {
        const a = this.pop();
        this.pop();
        this.push(a);
        return;
      }
      case OpCode.OP_OVER: {
        if (this.stack.length < 2)
          throw new ScriptEvalError("Stack underflow");
        this.push(cloneBytes(this.stack[this.stack.length - 2]));
        return;
      }
      case OpCode.OP_PICK: {
        const n = Number(this.popNum());
        if (n < 0 || n >= this.stack.length)
          throw new ScriptEvalError("OP_PICK out of range");
        this.push(cloneBytes(this.stack[this.stack.length - 1 - n]));
        return;
      }
      case OpCode.OP_ROLL: {
        const n = Number(this.popNum());
        if (n < 0 || n >= this.stack.length)
          throw new ScriptEvalError("OP_ROLL out of range");
        const idx = this.stack.length - 1 - n;
        const [val] = this.stack.splice(idx, 1);
        this.push(val);
        return;
      }
      case OpCode.OP_ROT: {
        if (this.stack.length < 3)
          throw new ScriptEvalError("Stack underflow");
        const a = this.stack.splice(this.stack.length - 3, 1)[0];
        this.stack.push(a);
        return;
      }
      case OpCode.OP_SWAP: {
        if (this.stack.length < 2)
          throw new ScriptEvalError("Stack underflow");
        const a = this.pop();
        const b = this.pop();
        this.push(a);
        this.push(b);
        return;
      }
      case OpCode.OP_TUCK: {
        if (this.stack.length < 2)
          throw new ScriptEvalError("Stack underflow");
        const a = this.pop();
        const b = this.pop();
        this.push(cloneBytes(a));
        this.push(b);
        this.push(a);
        return;
      }

      case OpCode.OP_CAT: {
        const b = this.pop();
        const a = this.pop();
        this.push(concat([a, b]));
        return;
      }
      case OpCode.OP_SPLIT: {
        const pos = Number(this.popNum());
        const data = this.pop();
        if (pos < 0 || pos > data.length)
          throw new ScriptEvalError("OP_SPLIT out of range");
        this.push(data.subarray(0, pos));
        this.push(data.subarray(pos));
        return;
      }
      case OpCode.OP_NUM2BIN: {
        const size = Number(this.popNum());
        const num = this.popNum();
        if (size < 0) throw new ScriptEvalError("OP_NUM2BIN size < 0");
        if (size === 0) {
          if (num !== BigInt(0))
            throw new ScriptEvalError("OP_NUM2BIN overflow");
          this.push(new Uint8Array());
          return;
        }

        const minimal = fromBigInt(num);
        if (minimal.length > size)
          throw new ScriptEvalError("OP_NUM2BIN overflow");

        if (minimal.length === size) {
          this.push(minimal);
          return;
        }

        const out = new Uint8Array(size);
        out.set(minimal);

        if (num < BigInt(0)) {
          if (minimal.length > 0) {
            out[minimal.length - 1] &= 0x7f;
          }
          out[size - 1] |= 0x80;
        }

        this.push(out);
        return;
      }
      case OpCode.OP_BIN2NUM: {
        const num = this.popNum();
        this.push(fromBigInt(num));
        return;
      }
      case OpCode.OP_SIZE: {
        this.push(fromBigInt(BigInt(this.top().length)));
        return;
      }

      case OpCode.OP_INVERT: {
        const data = this.pop();
        const out = new Uint8Array(data.length);
        for (let i = 0; i < data.length; i++) out[i] = data[i] ^ 0xff;
        this.push(out);
        return;
      }
      case OpCode.OP_AND:
      case OpCode.OP_OR:
      case OpCode.OP_XOR: {
        const b = this.pop();
        const a = this.pop();
        if (a.length !== b.length)
          throw new ScriptEvalError("Bitwise length mismatch");
        const out = new Uint8Array(a.length);
        for (let i = 0; i < a.length; i++) {
          if (opcode === OpCode.OP_AND) out[i] = a[i] & b[i];
          else if (opcode === OpCode.OP_OR) out[i] = a[i] | b[i];
          else out[i] = a[i] ^ b[i];
        }
        this.push(out);
        return;
      }
      case OpCode.OP_EQUAL: {
        const b = this.pop();
        const a = this.pop();
        pushBool(this.stack, equal(a, b));
        return;
      }
      case OpCode.OP_EQUALVERIFY: {
        const b = this.pop();
        const a = this.pop();
        if (!equal(a, b)) throw new ScriptEvalError("OP_EQUALVERIFY failed");
        return;
      }

      case OpCode.OP_1ADD:
        this.push(fromBigInt(this.popNum() + BigInt(1)));
        return;
      case OpCode.OP_1SUB:
        this.push(fromBigInt(this.popNum() - BigInt(1)));
        return;
      case OpCode.OP_2MUL:
        this.push(fromBigInt(this.popNum() * BigInt(2)));
        return;
      case OpCode.OP_2DIV:
        this.push(fromBigInt(this.popNum() / BigInt(2)));
        return;
      case OpCode.OP_NEGATE:
        this.push(fromBigInt(-this.popNum()));
        return;
      case OpCode.OP_ABS: {
        const n = this.popNum();
        this.push(fromBigInt(n < BigInt(0) ? -n : n));
        return;
      }
      case OpCode.OP_NOT:
        pushBool(this.stack, this.popNum() === BigInt(0));
        return;
      case OpCode.OP_0NOTEQUAL:
        pushBool(this.stack, this.popNum() !== BigInt(0));
        return;
      case OpCode.OP_ADD: {
        const b = this.popNum();
        const a = this.popNum();
        this.push(fromBigInt(a + b));
        return;
      }
      case OpCode.OP_SUB: {
        const b = this.popNum();
        const a = this.popNum();
        this.push(fromBigInt(a - b));
        return;
      }
      case OpCode.OP_MUL: {
        const b = this.popNum();
        const a = this.popNum();
        this.push(fromBigInt(a * b));
        return;
      }
      case OpCode.OP_DIV: {
        const b = this.popNum();
        if (b === BigInt(0)) throw new ScriptEvalError("OP_DIV by zero");
        const a = this.popNum();
        this.push(fromBigInt(a / b));
        return;
      }
      case OpCode.OP_MOD: {
        const b = this.popNum();
        if (b === BigInt(0)) throw new ScriptEvalError("OP_MOD by zero");
        const a = this.popNum();
        this.push(fromBigInt(a % b));
        return;
      }
      case OpCode.OP_LSHIFT: {
        const b = this.popNum();
        const a = this.popNum();
        this.push(fromBigInt(a << b));
        return;
      }
      case OpCode.OP_RSHIFT: {
        const b = this.popNum();
        const a = this.popNum();
        this.push(fromBigInt(a >> b));
        return;
      }
      case OpCode.OP_BOOLAND: {
        const b = this.popNum();
        const a = this.popNum();
        pushBool(this.stack, a !== BigInt(0) && b !== BigInt(0));
        return;
      }
      case OpCode.OP_BOOLOR: {
        const b = this.popNum();
        const a = this.popNum();
        pushBool(this.stack, a !== BigInt(0) || b !== BigInt(0));
        return;
      }
      case OpCode.OP_NUMEQUAL: {
        const b = this.popNum();
        const a = this.popNum();
        pushBool(this.stack, a === b);
        return;
      }
      case OpCode.OP_NUMEQUALVERIFY: {
        const b = this.popNum();
        const a = this.popNum();
        if (a !== b) throw new ScriptEvalError("OP_NUMEQUALVERIFY failed");
        return;
      }
      case OpCode.OP_NUMNOTEQUAL: {
        const b = this.popNum();
        const a = this.popNum();
        pushBool(this.stack, a !== b);
        return;
      }
      case OpCode.OP_LESSTHAN: {
        const b = this.popNum();
        const a = this.popNum();
        pushBool(this.stack, a < b);
        return;
      }
      case OpCode.OP_GREATERTHAN: {
        const b = this.popNum();
        const a = this.popNum();
        pushBool(this.stack, a > b);
        return;
      }
      case OpCode.OP_LESSTHANOREQUAL: {
        const b = this.popNum();
        const a = this.popNum();
        pushBool(this.stack, a <= b);
        return;
      }
      case OpCode.OP_GREATERTHANOREQUAL: {
        const b = this.popNum();
        const a = this.popNum();
        pushBool(this.stack, a >= b);
        return;
      }
      case OpCode.OP_MIN: {
        const b = this.popNum();
        const a = this.popNum();
        this.push(fromBigInt(a < b ? a : b));
        return;
      }
      case OpCode.OP_MAX: {
        const b = this.popNum();
        const a = this.popNum();
        this.push(fromBigInt(a > b ? a : b));
        return;
      }
      case OpCode.OP_WITHIN: {
        const max = this.popNum();
        const min = this.popNum();
        const x = this.popNum();
        pushBool(this.stack, x >= min && x < max);
        return;
      }

      case OpCode.OP_RIPEMD160: {
        const data = this.pop();
        this.push(ripemd160(data));
        return;
      }
      case OpCode.OP_SHA1:
        throw new ScriptEvalError("OP_SHA1 not supported");
      case OpCode.OP_SHA256: {
        const data = this.pop();
        this.push(sha256(data));
        return;
      }
      case OpCode.OP_HASH160: {
        const data = this.pop();
        this.push(hash160(data));
        return;
      }
      case OpCode.OP_HASH256: {
        const data = this.pop();
        this.push(hash256(data));
        return;
      }
      case OpCode.OP_CODESEPARATOR:
        this.codeSeparator = pc;
        return;
      case OpCode.OP_CHECKSIG:
      case OpCode.OP_CHECKSIGVERIFY: {
        const pubKey = this.pop();
        const sigWithType = this.pop();
        const { signature, sighashType } = parseSignature(sigWithType);

        const scriptCode = this.getScriptCode();
        const preimage = buildSighashPreimage(
          this.ctx,
          scriptCode,
          sighashType,
        );
        const msg = hash256(preimage);

        let ok = false;
        try {
          ok =
            signature.length > 0 &&
            nobleVerify(signature, msg, pubKey, {
              prehash: false,
              format: "compact",
            });
        } catch {
          ok = false;
        }

        if (opcode === OpCode.OP_CHECKSIGVERIFY) {
          if (!ok) throw new ScriptEvalError("OP_CHECKSIGVERIFY failed");
          return;
        }

        pushBool(this.stack, ok);
        return;
      }
      case OpCode.OP_CHECKMULTISIG:
      case OpCode.OP_CHECKMULTISIGVERIFY: {
        const n = Number(this.popNum());
        if (n < 0 || n > this.stack.length)
          throw new ScriptEvalError("OP_CHECKMULTISIG invalid pubkey count");

        const pubKeys = this.stack.splice(this.stack.length - n, n);
        const m = Number(this.popNum());
        if (m < 0 || m > this.stack.length)
          throw new ScriptEvalError("OP_CHECKMULTISIG invalid sig count");

        const sigs = this.stack.splice(this.stack.length - m, m);

        this.pop(); // OP_CHECKMULTISIG bug

        let sigIdx = 0;
        let keyIdx = 0;

        while (sigIdx < m && keyIdx < n) {
          const { signature, sighashType } = parseSignature(sigs[sigIdx]);
          const scriptCode = this.getScriptCode();
          const preimage = buildSighashPreimage(
            this.ctx,
            scriptCode,
            sighashType,
          );
          const msg = hash256(preimage);

          const ok =
            signature.length > 0 &&
            nobleVerify(signature, msg, pubKeys[keyIdx], {
              prehash: false,
              format: "compact",
            });

          if (ok) sigIdx++;
          keyIdx++;
        }

        const success = sigIdx === m;

        if (opcode === OpCode.OP_CHECKMULTISIGVERIFY) {
          if (!success)
            throw new ScriptEvalError("OP_CHECKMULTISIGVERIFY failed");
          return;
        }

        pushBool(this.stack, success);
        return;
      }

      case OpCode.OP_CHECKLOCKTIMEVERIFY: {
        const locktime = Number(decodeScriptNum(this.top()));
        if (locktime < 0) throw new ScriptEvalError("CLTV negative");
        const txLock = this.ctx.tx.LockTime;
        const txInput = this.ctx.tx.Inputs[this.ctx.inputIndex];
        if (txInput.Sequence === 0xffffffff)
          throw new ScriptEvalError("CLTV disabled by sequence");
        if (
          (locktime < 500000000 && txLock >= 500000000) ||
          (locktime >= 500000000 && txLock < 500000000)
        )
          throw new ScriptEvalError("CLTV locktime type mismatch");
        if (txLock < locktime) throw new ScriptEvalError("CLTV not yet reached");
        return;
      }
      case OpCode.OP_CHECKSEQUENCEVERIFY:
        throw new ScriptEvalError("OP_CHECKSEQUENCEVERIFY not supported");

      case OpCode.OP_RESERVED:
      case OpCode.OP_VER:
      case OpCode.OP_VERIF:
      case OpCode.OP_VERNOTIF:
      case OpCode.OP_RESERVED1:
      case OpCode.OP_RESERVED2:
        throw new ScriptEvalError("Disabled opcode");

      default:
        throw new ScriptEvalError(`Unsupported opcode: 0x${opcode.toString(16)}`);
    }
  };
}

export const evaluateScripts = (
  unlockingScript: Bytes,
  lockingScript: Bytes,
  ctx: ScriptEvalContext,
  options?: ScriptEvalOptions,
): ScriptEvalResult => {
  const interpreter = new ScriptInterpreter(ctx, options);

  try {
    interpreter.execute(unlockingScript);
    interpreter.execute(lockingScript);

    const stack = interpreter.getStack();
    const success = stack.length > 0 && isTruthy(stack[stack.length - 1]);

    return {
      success,
      stack,
      altStack: interpreter.getAltStack(),
      error: success ? undefined : "Script evaluated to false",
    };
  } catch (err) {
    return {
      success: false,
      stack: interpreter.getStack(),
      altStack: interpreter.getAltStack(),
      error: err instanceof Error ? err.message : "Script error",
    };
  }
};
