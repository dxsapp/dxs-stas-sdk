import { Address } from "../../bitcoin/address";
import { OpCode } from "../../bitcoin/op-codes";
import { ScriptType } from "../../bitcoin/script-type";
import { Bytes, bytesToUtf8, fromHex, toHex } from "../../bytes";
import { buildStas3BaseTokens } from "../templates/stas3-freeze-multisig-base";
import {
  getP2stasTokens,
  nullDataTokens,
  p2phkTokens,
} from "../script-samples";
import { ScriptToken } from "../script-token";
import { BaseScriptReader } from "./base-script-reader";
import { ScriptReadToken } from "./script-read-token";

type DetectContext = {
  Result: boolean;
  OpReturnReached: boolean;
};

type ScriptSample = {
  type: ScriptType;
  tokens: ScriptToken[];
  ctx: DetectContext;
};

type Stas30Stage =
  | "owner"
  | "second"
  | "base"
  | "redemption"
  | "flags"
  | "tail";

type Stas30DetectContext = {
  Result: boolean;
  Stage: Stas30Stage;
  BaseIdx: number;
  FreezeEnabled: boolean;
  HasAuthority: boolean;
  Owner?: Bytes;
  SecondFieldData?: Bytes;
  SecondFieldOpCode?: number;
  Redemption?: Bytes;
  Flags?: Bytes;
  ServiceFields: Bytes[];
  OptionalData: Bytes[];
};

export class LockingScriptReader extends BaseScriptReader {
  private samples: ScriptSample[] = [
    {
      type: ScriptType.p2pkh,
      tokens: p2phkTokens,
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

  private stas30BaseTokens = buildStas3BaseTokens();

  private stas30Ctx: Stas30DetectContext = {
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
  Stas30?: {
    Owner: Bytes;
    SecondFieldData?: Bytes;
    SecondFieldOpCode?: number;
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

    this.finalizeStas30();
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

    this.handleStas30Token(token);
    if (this.stas30Ctx.Result) activeDetectors++;

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

  private handleStas30Token(token: ScriptReadToken): void {
    if (!this.stas30Ctx.Result) return;

    switch (this.stas30Ctx.Stage) {
      case "owner": {
        if (!this.isPushData(token)) {
          this.stas30Ctx.Result = false;
          return;
        }
        this.stas30Ctx.Owner = token.Data;
        this.stas30Ctx.Stage = "second";
        return;
      }

      case "second": {
        if (this.isPushData(token)) {
          this.stas30Ctx.SecondFieldData = token.Data;
        } else {
          this.stas30Ctx.SecondFieldOpCode = token.OpCodeNum;
        }
        this.stas30Ctx.Stage = "base";
        return;
      }

      case "base": {
        const expected = this.stas30BaseTokens[this.stas30Ctx.BaseIdx];
        if (!expected || !this.sameToken(expected, token)) {
          this.stas30Ctx.Result = false;
          return;
        }
        this.stas30Ctx.BaseIdx++;
        if (this.stas30Ctx.BaseIdx === this.stas30BaseTokens.length) {
          this.stas30Ctx.Stage = "redemption";
        }
        return;
      }

      case "redemption": {
        if (!this.isPushData(token) || token.Data.length !== 20) {
          this.stas30Ctx.Result = false;
          return;
        }
        this.stas30Ctx.Redemption = token.Data;
        this.stas30Ctx.Stage = "flags";
        return;
      }

      case "flags": {
        if (!this.isPushData(token)) {
          this.stas30Ctx.Result = false;
          return;
        }
        this.stas30Ctx.Flags = token.Data;
        this.stas30Ctx.FreezeEnabled =
          token.Data.length > 0 && (token.Data[0] & 0x01) === 0x01;
        this.stas30Ctx.Stage = "tail";
        return;
      }

      case "tail": {
        if (!this.isPushData(token)) {
          this.stas30Ctx.Result = false;
          return;
        }
        if (this.stas30Ctx.FreezeEnabled && !this.stas30Ctx.HasAuthority) {
          this.stas30Ctx.ServiceFields.push(token.Data);
          this.stas30Ctx.HasAuthority = true;
        } else {
          this.stas30Ctx.OptionalData.push(token.Data);
        }
        return;
      }
    }
  }

  private finalizeStas30(): void {
    if (!this.stas30Ctx.Result) return;
    if (this.stas30Ctx.Stage === "owner") return;
    if (this.stas30Ctx.Stage === "second") return;
    if (this.stas30Ctx.Stage === "base") return;
    if (this.stas30Ctx.Stage === "redemption") return;
    if (this.stas30Ctx.Stage === "flags") return;
    if (
      !this.stas30Ctx.Owner ||
      !this.stas30Ctx.Redemption ||
      !this.stas30Ctx.Flags
    )
      return;
    if (this.stas30Ctx.FreezeEnabled && !this.stas30Ctx.HasAuthority) return;

    this.ScriptTypeOverride = ScriptType.p2stas30;
    if (this.stas30Ctx.Owner.length === 20) {
      this.Address = new Address(this.stas30Ctx.Owner);
    }
    this.Stas30 = {
      Owner: this.stas30Ctx.Owner,
      SecondFieldData: this.stas30Ctx.SecondFieldData,
      SecondFieldOpCode: this.stas30Ctx.SecondFieldOpCode,
      Redemption: this.stas30Ctx.Redemption,
      Flags: this.stas30Ctx.Flags,
      FreezeEnabled: this.stas30Ctx.FreezeEnabled,
      ServiceFields: this.stas30Ctx.ServiceFields,
      OptionalData: this.stas30Ctx.OptionalData,
    };

    if (this.stas30Ctx.Owner.length === 20) {
      this.Address = new Address(this.stas30Ctx.Owner);
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
