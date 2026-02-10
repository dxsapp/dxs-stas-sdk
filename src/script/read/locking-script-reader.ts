import { Address } from "../../bitcoin/address";
import { OpCode } from "../../bitcoin/op-codes";
import { ScriptType } from "../../bitcoin/script-type";
import { Bytes, bytesToUtf8, fromHex, toHex } from "../../bytes";
import { buildStas3BaseTokens } from "../templates/stas3-freeze-multisig-base";
import {
  getP2stasTokens,
  nullDataTokens,
  p2mpkhTokens,
  p2phkTokens,
} from "../script-samples";
import { ScriptToken } from "../script-token";
import { BaseScriptReader } from "./base-script-reader";
import { ScriptReadToken } from "./script-read-token";
import {
  ParsedActionData,
  decodeActionData,
} from "../stas3-second-field";

type DetectContext = {
  Result: boolean;
  OpReturnReached: boolean;
};

type ScriptSample = {
  type: ScriptType;
  tokens: ScriptToken[];
  ctx: DetectContext;
};

type DstasStage =
  | "owner"
  | "second"
  | "base"
  | "redemption"
  | "flags"
  | "tail";

type DstasDetectContext = {
  Result: boolean;
  Stage: DstasStage;
  BaseIdx: number;
  FreezeEnabled: boolean;
  HasAuthority: boolean;
  Owner?: Bytes;
  ActionDataRaw?: Bytes;
  ActionDataOpCode?: number;
  Redemption?: Bytes;
  Flags?: Bytes;
  ServiceFields: Bytes[];
  OptionalData: Bytes[];
};

const tryDecodeActionData = (
  data: Bytes | undefined,
): ParsedActionData | undefined => {
  if (!data) return undefined;
  try {
    return decodeActionData(data);
  } catch {
    return {
      kind: "unknown",
      action: data[0] ?? 0,
      payload: data.subarray(1),
    };
  }
};

export class LockingScriptReader extends BaseScriptReader {
  private samples: ScriptSample[] = [
    {
      type: ScriptType.p2pkh,
      tokens: p2phkTokens,
      ctx: { Result: true, OpReturnReached: false },
    },
    {
      type: ScriptType.p2mpkh,
      tokens: p2mpkhTokens,
      ctx: { Result: true, OpReturnReached: false },
    },
    {
      type: ScriptType.p2stas,
      tokens: getP2stasTokens(),
      ctx: { Result: true, OpReturnReached: false },
    },
    {
      type: ScriptType.nullData,
      tokens: nullDataTokens,
      ctx: { Result: true, OpReturnReached: false },
    },
  ];

  private dstasBaseTokens = buildStas3BaseTokens();

  private dstasCtx: DstasDetectContext = {
    Result: true,
    Stage: "owner",
    BaseIdx: 0,
    FreezeEnabled: false,
    HasAuthority: false,
    ServiceFields: [],
    OptionalData: [],
  };

  Address?: Address;
  Data?: Bytes[];
  Dstas?: {
    Owner: Bytes;
    ActionDataRaw?: Bytes;
    ActionDataOpCode?: number;
    ActionDataParsed?: ParsedActionData;
    Redemption: Bytes;
    Flags: Bytes;
    FreezeEnabled: boolean;
    ServiceFields: Bytes[];
    OptionalData: Bytes[];
  };

  get ScriptType(): ScriptType {
    if (this.ScriptTypeOverride !== undefined) return this.ScriptTypeOverride;

    for (const sample of this.samples) {
      if (sample.ctx.Result) return sample.type;
    }

    return ScriptType.unknown;
  }

  private constructor(bytes: Bytes, expectedLength?: number) {
    super(bytes, expectedLength);
  }

  private read(): void {
    const count = this.readInternal();

    if (count === -1) return;

    for (const sample of this.samples) {
      if (!sample.ctx.Result) continue;
      sample.ctx.Result =
        sample.ctx.OpReturnReached || sample.tokens.length === count;
    }

    this.finalizeDstas();
  }

  protected handleToken(token: ScriptReadToken, tokenIdx: number): boolean {
    let activeDetectors = 0;

    for (const sample of this.samples) {
      if (!sample.ctx.Result) continue;
      activeDetectors++;

      if (!sample.ctx.OpReturnReached) {
        if (sample.tokens.length === tokenIdx) {
          if (token.OpCode === OpCode.OP_RETURN) {
            sample.ctx.OpReturnReached = true;
          }
        } else {
          const expected = sample.tokens[tokenIdx];
          const nextResult = expected ? this.sameToken(expected, token) : false;
          sample.ctx.Result = nextResult;

          if (nextResult) {
            if (expected.IsReceiverId && token.Data.length > 0) {
              this.Address = new Address(token.Data);
            }
          }
        }
      } else {
        this.addData(token.Data);
      }
    }

    this.handleDstasToken(token);
    if (this.dstasCtx.Result) activeDetectors++;

    return activeDetectors > 0;
  }

  private sameToken(expected: ScriptToken, actual: ScriptReadToken): boolean {
    return (
      expected.OpCodeNum === actual.OpCodeNum &&
      expected.DataLength === actual.Data.length
    );
  }

  private addData(data: Bytes): void {
    if (!this.Data) this.Data = [];
    this.Data.push(data);
  }

  private handleDstasToken(token: ScriptReadToken): void {
    if (!this.dstasCtx.Result) return;

    switch (this.dstasCtx.Stage) {
      case "owner": {
        if (!this.isPushData(token)) {
          this.dstasCtx.Result = false;
          return;
        }
        this.dstasCtx.Owner = token.Data;
        this.dstasCtx.Stage = "second";
        return;
      }

      case "second": {
        if (this.isPushData(token)) {
          this.dstasCtx.ActionDataRaw = token.Data;
        } else {
          this.dstasCtx.ActionDataOpCode = token.OpCodeNum;
        }
        this.dstasCtx.Stage = "base";
        return;
      }

      case "base": {
        const expected = this.dstasBaseTokens[this.dstasCtx.BaseIdx];
        if (!expected || !this.sameToken(expected, token)) {
          this.dstasCtx.Result = false;
          return;
        }
        this.dstasCtx.BaseIdx++;
        if (this.dstasCtx.BaseIdx === this.dstasBaseTokens.length) {
          this.dstasCtx.Stage = "redemption";
        }
        return;
      }

      case "redemption": {
        if (!this.isPushData(token) || token.Data.length !== 20) {
          this.dstasCtx.Result = false;
          return;
        }
        this.dstasCtx.Redemption = token.Data;
        this.dstasCtx.Stage = "flags";
        return;
      }

      case "flags": {
        if (!this.isPushData(token)) {
          this.dstasCtx.Result = false;
          return;
        }
        this.dstasCtx.Flags = token.Data;
        this.dstasCtx.FreezeEnabled =
          token.Data.length > 0 && (token.Data[0] & 0x01) === 0x01;
        this.dstasCtx.Stage = "tail";
        return;
      }

      case "tail": {
        if (!this.isPushData(token)) {
          this.dstasCtx.Result = false;
          return;
        }
        if (this.dstasCtx.FreezeEnabled && !this.dstasCtx.HasAuthority) {
          this.dstasCtx.ServiceFields.push(token.Data);
          this.dstasCtx.HasAuthority = true;
        } else {
          this.dstasCtx.OptionalData.push(token.Data);
        }
        return;
      }
    }
  }

  private finalizeDstas(): void {
    if (!this.dstasCtx.Result) return;
    if (this.dstasCtx.Stage === "owner") return;
    if (this.dstasCtx.Stage === "second") return;
    if (this.dstasCtx.Stage === "base") return;
    if (this.dstasCtx.Stage === "redemption") return;
    if (this.dstasCtx.Stage === "flags") return;
    if (
      !this.dstasCtx.Owner ||
      !this.dstasCtx.Redemption ||
      !this.dstasCtx.Flags
    )
      return;
    if (this.dstasCtx.FreezeEnabled && !this.dstasCtx.HasAuthority) return;

    this.ScriptTypeOverride = ScriptType.dstas;
    if (this.dstasCtx.Owner.length === 20) {
      this.Address = new Address(this.dstasCtx.Owner);
    }
    this.Dstas = {
      Owner: this.dstasCtx.Owner,
      ActionDataRaw: this.dstasCtx.ActionDataRaw,
      ActionDataOpCode: this.dstasCtx.ActionDataOpCode,
      ActionDataParsed: tryDecodeActionData(this.dstasCtx.ActionDataRaw),
      Redemption: this.dstasCtx.Redemption,
      Flags: this.dstasCtx.Flags,
      FreezeEnabled: this.dstasCtx.FreezeEnabled,
      ServiceFields: this.dstasCtx.ServiceFields,
      OptionalData: this.dstasCtx.OptionalData,
    };

    if (this.dstasCtx.Owner.length === 20) {
      this.Address = new Address(this.dstasCtx.Owner);
    }
  }

  private isPushData(token: ScriptReadToken): boolean {
    return (
      token.OpCodeNum > 0 &&
      (token.OpCodeNum < OpCode.OP_PUSHDATA1 ||
        token.OpCodeNum === OpCode.OP_PUSHDATA1 ||
        token.OpCodeNum === OpCode.OP_PUSHDATA2 ||
        token.OpCodeNum === OpCode.OP_PUSHDATA4)
    );
  }

  getTokenId(): string | null {
    if (this.ScriptType !== ScriptType.p2stas) return null;
    if (!this.Data || this.Data.length === 0) return null;
    return toHex(this.Data[0]);
  }

  getSymbol(): string | null {
    if (this.ScriptType !== ScriptType.p2stas) return null;
    if (!this.Data || this.Data.length < 2) return null;
    return bytesToUtf8(this.Data[1]);
  }

  getData(): Bytes {
    if (this.ScriptType !== ScriptType.p2stas) return new Uint8Array(0);
    if (!this.Data || this.Data.length <= 2) return new Uint8Array(0);
    return this.Data[2];
  }

  static readHex(hex: string): LockingScriptReader {
    return LockingScriptReader.read(fromHex(hex));
  }

  static read(bytes: Bytes, expectedLength?: number): LockingScriptReader {
    const reader = new LockingScriptReader(bytes, expectedLength);
    reader.read();
    return reader;
  }

  private ScriptTypeOverride?: ScriptType;
}
