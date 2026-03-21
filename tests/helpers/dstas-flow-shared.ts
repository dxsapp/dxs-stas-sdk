import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { Address, OutPoint, ScriptType } from "../../src/bitcoin";
import { OpCode } from "../../src/bitcoin/op-codes";
import { PrivateKey } from "../../src/bitcoin/private-key";
import { TokenScheme } from "../../src/bitcoin/token-scheme";
import { Wallet } from "../../src/bitcoin/wallet";
import { fromHex, toHex } from "../../src/bytes";
import {
  BuildDstasFreezeTx,
  BuildDstasIssueTxs,
  BuildDstasTransferTx,
} from "../../src/dstas-factory";
import { hash160, hash256 } from "../../src/hashes";
import {
  buildSwapActionData,
  computeDstasRequestedScriptHash,
} from "../../src/script";
import { ScriptBuilder } from "../../src/script/build/script-builder";
import { TransactionBuilder } from "../../src/transaction/build/transaction-builder";
import { OutputBuilder } from "../../src/transaction/build/output-builder";
import { FeeRate } from "../../src/transaction-factory";
import { TransactionReader } from "../../src/transaction/read/transaction-reader";
import {
  createDefaultDstasScheme,
  createRealFundingOutPoint,
} from "./dstas-flow-helpers";
import { reverseBytes } from "../../src/buffer/buffer-utils";

export const referenceTransferTxPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/dstas-reference-transfer-p2pkh.txt",
);

export const resolveFromTx = (txHex: string) => {
  const tx = TransactionReader.readHex(txHex);
  return (txId: string, vout: number) => {
    if (txId !== tx.Id) return undefined;
    const out = tx.Outputs[vout];
    if (!out) return undefined;
    return { lockingScript: out.LockingScript, satoshis: out.Satoshis };
  };
};

export const strictResolverFromTxHexes =
  (...txHexes: string[]) =>
  (txId: string, vout: number) => {
    for (const txHex of txHexes) {
      const prev = resolveFromTx(txHex)(txId, vout);
      if (prev) return prev;
    }
    return undefined;
  };

export const buildMlpkhPreimage = (
  m: number,
  pubKeys: Uint8Array[],
): Uint8Array => {
  const n = pubKeys.length;
  const result = new Uint8Array(1 + n * (1 + 33) + 1);
  let off = 0;
  result[off++] = m & 0xff;
  for (const key of pubKeys) {
    result[off++] = 0x21;
    result.set(key, off);
    off += key.length;
  }
  result[off] = n & 0xff;
  return result;
};

export const swapDestination = ({
  satoshis,
  owner,
  tokenIdHex,
  freezable,
  confiscatable = false,
  authorityServiceField,
  confiscationAuthorityServiceField,
  actionData,
}: {
  satoshis: number;
  owner: Uint8Array;
  tokenIdHex: string;
  freezable: boolean;
  confiscatable?: boolean;
  authorityServiceField: Uint8Array;
  confiscationAuthorityServiceField?: Uint8Array;
  actionData?: ReturnType<typeof buildSwapActionData> | null;
}) => ({
  Satoshis: satoshis,
  Owner: owner,
  TokenIdHex: tokenIdHex,
  Freezable: freezable,
  Confiscatable: confiscatable,
  FreezeAuthorityServiceField: authorityServiceField,
  ConfiscationAuthorityServiceField: confiscationAuthorityServiceField,
  ActionData: actionData ?? null,
});

export const buildOwnerMultisigUnlockingScript = ({
  txBuilder,
  stasInputIndex,
  spendingType,
  signers,
  pubKeys,
  threshold,
}: {
  txBuilder: TransactionBuilder;
  stasInputIndex: number;
  spendingType: number;
  signers: Wallet[];
  pubKeys: Uint8Array[];
  threshold: number;
}) => {
  const script = new ScriptBuilder(ScriptType.p2stas);
  let hasNote = false;
  let hasChange = false;

  for (const output of txBuilder.Outputs) {
    if (output.LockingScript.ScriptType === ScriptType.nullData) {
      const payload = output.LockingScript.toBytes().subarray(2);
      script.addData(payload);
      hasNote = true;
      continue;
    }

    const ownerField =
      output.LockingScript.ToAddress?.Hash160 ??
      output.LockingScript._tokens[0]?.Data;
    if (!ownerField) throw new Error("Output is missing owner field");

    script.addNumber(output.Satoshis).addData(ownerField);

    if (output.LockingScript.ScriptType === ScriptType.dstas) {
      const actionDataToken = output.LockingScript._tokens[1];
      if (actionDataToken?.Data) script.addData(actionDataToken.Data);
      else if (actionDataToken) script.addOpCode(actionDataToken.OpCodeNum);
      else throw new Error("Divisible STAS output missing action data");
    }

    if (output.LockingScript.ScriptType === ScriptType.p2pkh) hasChange = true;
  }

  if (!hasChange) {
    script.addOpCode(OpCode.OP_0);
    script.addOpCode(OpCode.OP_0);
  }
  if (!hasNote) script.addOpCode(OpCode.OP_0);

  const fundingInput = txBuilder.Inputs[txBuilder.Inputs.length - 1];
  script
    .addNumber(fundingInput.OutPoint.Vout)
    .addData(reverseBytes(fromHex(fundingInput.OutPoint.TxId)))
    .addOpCode(OpCode.OP_0);

  const preimage = txBuilder.Inputs[stasInputIndex].preimage(
    TransactionBuilder.DefaultSighashType,
  );
  const preimageHash = hash256(preimage);

  script.addData(preimage).addNumber(spendingType);
  script.addOpCode(OpCode.OP_0);

  for (const signer of signers) {
    const der = signer.sign(preimageHash);
    const derWithType = new Uint8Array(der.length + 1);
    derWithType.set(der);
    derWithType[der.length] = TransactionBuilder.DefaultSighashType;
    script.addData(derWithType);
  }

  script.addData(buildMlpkhPreimage(threshold, pubKeys));
  return script.toBytes();
};

export const buildRedeemTx = ({
  stasOutPoint,
  stasOwner,
  feeOutPoint,
  feeOwner,
  redeemAddress,
  spendingType = 1,
}: {
  stasOutPoint: OutPoint;
  stasOwner: PrivateKey | Wallet;
  feeOutPoint: OutPoint;
  feeOwner: PrivateKey | Wallet;
  redeemAddress: Address;
  spendingType?: number;
}) => {
  const txBuilder = TransactionBuilder.init()
    .addInput(stasOutPoint, stasOwner)
    .addInput(feeOutPoint, feeOwner)
    .addP2MpkhOutput(stasOutPoint.Satoshis, redeemAddress);

  const feeOutputIdx = txBuilder.Outputs.length;
  txBuilder.Inputs[0].DstasSpendingType = spendingType;

  return txBuilder
    .addChangeOutputWithFee(
      feeOutPoint.Address!,
      feeOutPoint.Satoshis,
      FeeRate,
      feeOutputIdx,
    )
    .sign()
    .toHex();
};

export const createSwapContext = ({
  satoshisA = 100,
  satoshisB = 100,
  actionDataA,
  actionDataB,
  frozenA = false,
  frozenB = false,
}: {
  satoshisA?: number;
  satoshisB?: number;
  actionDataA: ReturnType<typeof buildSwapActionData> | null;
  actionDataB: ReturnType<typeof buildSwapActionData> | null;
  frozenA?: boolean;
  frozenB?: boolean;
}) => {
  const bob = Wallet.fromMnemonic(
    "group spy extend supreme monkey judge avocado cancel exit educate modify bubble",
  ).deriveWallet("m/44'/236'/0'/0/0");
  const cat = Wallet.fromMnemonic(
    "group spy extend supreme monkey judge avocado cancel exit educate modify bubble",
  ).deriveWallet("m/44'/236'/0'/0/1");

  const schemeA = createDefaultDstasScheme(bob, cat);
  const schemeB = new TokenScheme(
    "Divisible STASB",
    toHex(cat.Address.Hash160),
    "S30B",
    1,
    {
      freeze: true,
      confiscation: true,
      isDivisible: true,
      freezeAuthority: { m: 1, publicKeys: [toHex(bob.PublicKey)] },
      confiscationAuthority: { m: 1, publicKeys: [toHex(bob.PublicKey)] },
    },
  );

  const fundingA = createRealFundingOutPoint(bob);
  const fundingB = createRealFundingOutPoint(cat);

  const issueA = BuildDstasIssueTxs({
    fundingPayment: { OutPoint: fundingA, Owner: bob },
    scheme: schemeA,
    destinations: [
      {
        Satoshis: satoshisA,
        To: bob.Address,
        ActionData: actionDataA,
        Frozen: frozenA,
      },
    ],
    feeRate: FeeRate,
  });
  const issueB = BuildDstasIssueTxs({
    fundingPayment: { OutPoint: fundingB, Owner: cat },
    scheme: schemeB,
    destinations: [
      {
        Satoshis: satoshisB,
        To: cat.Address,
        ActionData: actionDataB,
        Frozen: frozenB,
      },
    ],
    feeRate: FeeRate,
  });

  const txIssueA = TransactionReader.readHex(issueA.issueTxHex);
  const txIssueB = TransactionReader.readHex(issueB.issueTxHex);
  const stasA = new OutPoint(
    txIssueA.Id,
    0,
    txIssueA.Outputs[0].LockingScript,
    txIssueA.Outputs[0].Satoshis,
    bob.Address,
    ScriptType.dstas,
  );
  stasA.Transaction = txIssueA;

  const stasB = new OutPoint(
    txIssueB.Id,
    0,
    txIssueB.Outputs[0].LockingScript,
    txIssueB.Outputs[0].Satoshis,
    cat.Address,
    ScriptType.dstas,
  );
  stasB.Transaction = txIssueB;

  const fee = new OutPoint(
    txIssueA.Id,
    1,
    txIssueA.Outputs[1].LockingScript,
    txIssueA.Outputs[1].Satoshis,
    bob.Address,
    ScriptType.p2pkh,
  );

  const resolvePrev = (txId: string, vout: number) => {
    if (txId === txIssueA.Id) {
      const out = txIssueA.Outputs[vout];
      if (out)
        return { lockingScript: out.LockingScript, satoshis: out.Satoshis };
    }
    if (txId === txIssueB.Id) {
      const out = txIssueB.Outputs[vout];
      if (out)
        return { lockingScript: out.LockingScript, satoshis: out.Satoshis };
    }
    return undefined;
  };

  return {
    bob,
    cat,
    schemeA,
    schemeB,
    stasA,
    stasB,
    fee,
    resolvePrev,
  };
};
