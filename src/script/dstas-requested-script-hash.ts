import { ScriptType } from "../bitcoin/script-type";
import { Bytes, fromHex } from "../bytes";
import { sha256 } from "../hashes";
import { OpCode } from "../bitcoin/op-codes";
import {
  DstasFlagsInput,
  buildDstasFlags,
  buildDstasLockingTokens,
} from "./build/dstas-locking-builder";
import { ScriptBuilder } from "./build/script-builder";

export const buildDstasLockingScriptForOwnerField = ({
  ownerField,
  tokenIdHex,
  freezable,
  confiscatable = false,
  authorityServiceField,
  confiscationAuthorityServiceField,
  frozen = false,
}: {
  ownerField: Bytes;
  tokenIdHex: string;
  freezable: boolean;
  confiscatable?: boolean;
  authorityServiceField: Bytes;
  confiscationAuthorityServiceField?: Bytes;
  frozen?: boolean;
}) => {
  const flags: DstasFlagsInput = { freezable, confiscatable };
  const tokens = buildDstasLockingTokens({
    owner: ownerField,
    actionData: null,
    redemptionPkh: fromHex(tokenIdHex),
    frozen,
    flags: buildDstasFlags(flags),
    serviceFields: [
      ...(freezable ? [authorityServiceField] : []),
      ...(confiscatable
        ? [confiscationAuthorityServiceField ?? authorityServiceField]
        : []),
    ],
    optionalData: [],
  });

  return ScriptBuilder.fromTokens(tokens, ScriptType.dstas);
};

export const computeDstasRequestedScriptHash = (
  lockingScript: Bytes | ScriptBuilder,
): Uint8Array => {
  const scriptBytes =
    lockingScript instanceof ScriptBuilder
      ? lockingScript.toBytes()
      : lockingScript;
  let offset = 0;

  const consumeToken = () => {
    if (offset >= scriptBytes.length) {
      throw new Error(
        "Divisible STAS locking script must include owner + action data",
      );
    }

    const opcode = scriptBytes[offset++];
    if (opcode >= 0x01 && opcode <= 0x4b) {
      offset += opcode;
      return;
    }
    if (opcode === OpCode.OP_PUSHDATA1) {
      if (offset >= scriptBytes.length) {
        throw new Error("Malformed PUSHDATA1 in DSTAS locking script");
      }
      offset += 1 + scriptBytes[offset];
      return;
    }
    if (opcode === OpCode.OP_PUSHDATA2) {
      if (offset + 1 >= scriptBytes.length) {
        throw new Error("Malformed PUSHDATA2 in DSTAS locking script");
      }
      const size = scriptBytes[offset] | (scriptBytes[offset + 1] << 8);
      offset += 2 + size;
      return;
    }
    if (opcode === OpCode.OP_PUSHDATA4) {
      if (offset + 3 >= scriptBytes.length) {
        throw new Error("Malformed PUSHDATA4 in DSTAS locking script");
      }
      const size =
        scriptBytes[offset] |
        (scriptBytes[offset + 1] << 8) |
        (scriptBytes[offset + 2] << 16) |
        (scriptBytes[offset + 3] << 24);
      offset += 4 + size;
    }
  };

  consumeToken();
  consumeToken();
  if (offset > scriptBytes.length) {
    throw new Error("Malformed DSTAS locking script");
  }

  return sha256(scriptBytes.subarray(offset));
};
