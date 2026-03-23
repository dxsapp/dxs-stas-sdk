import { ScriptType } from "../bitcoin/script-type";
import { Bytes, fromHex } from "../bytes";
import { sha256 } from "../hashes";
import {
  DstasFlagsInput,
  buildDstasFlags,
  buildDstasLockingTokens,
} from "./build/dstas-locking-builder";
import { ScriptBuilder } from "./build/script-builder";
import { extractDstasCounterpartyScript } from "./dstas-swap-script";

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
): Uint8Array => sha256(extractDstasCounterpartyScript(lockingScript));
