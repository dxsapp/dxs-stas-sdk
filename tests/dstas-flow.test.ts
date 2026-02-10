import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { ByteReader } from "../src/binary";
import { bs58check } from "../src/base";
import { Address } from "../src/bitcoin/address";
import { OpCode } from "../src/bitcoin/op-codes";
import { PrivateKey } from "../src/bitcoin/private-key";
import { Wallet } from "../src/bitcoin/wallet";
import { TransactionBuilder } from "../src/transaction/build/transaction-builder";
import { OutputBuilder } from "../src/transaction/build/output-builder";
import {
  evaluateScripts,
  evaluateTransactionHex,
  buildSwapActionData,
  decomposeStas3LockingScript,
  decomposeStas3UnlockingScript,
} from "../src/script";
import { ScriptBuilder } from "../src/script/build/script-builder";
import {
  buildStas3Flags,
  buildStas3FreezeMultisigTokens,
} from "../src/script/build/stas3-freeze-multisig-builder";
import { TransactionReader } from "../src/transaction/read/transaction-reader";
import { fromHex, toHex } from "../src/bytes";
import { OutPoint, ScriptType } from "../src/bitcoin";
import { TokenScheme } from "../src/bitcoin/token-scheme";
import {
  BuildDstasBaseTx,
  BuildDstasIssueTxs,
  BuildDstasSwapSwapTx,
  BuildDstasSwapTx,
  BuildDstasTransferSwapTx,
  BuildDstasTransferTx,
  BuildDstasUnfreezeTx,
} from "../src/dstas-factory";
import { FeeRate } from "../src/transaction-factory";
import {
  buildFreezeFromFixture,
  buildTransferFromFixture,
  createDefaultDstasScheme,
  createRealFundingOutPoint,
  createRealFundingFlowFixture,
} from "./helpers/dstas-flow-helpers";
import { assertFeeInRange } from "./helpers/fee-assertions";
import { dumpTransferDebug } from "./debug/dstas-transfer-debug";
import { hash160, hash256, sha256 } from "../src/hashes";
import { reverseBytes } from "../src/buffer/buffer-utils";

const referenceTransferTxPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/dstas-reference-transfer-p2pkh.txt",
);

const resolveFromTx = (txHex: string) => {
  const tx = TransactionReader.readHex(txHex);
  return (txId: string, vout: number) => {
    if (txId !== tx.Id) return undefined;
    const out = tx.Outputs[vout];
    if (!out) return undefined;
    return { lockingScript: out.LockignScript, satoshis: out.Satoshis };
  };
};

const buildMlpkhPreimage = (m: number, pubKeys: Uint8Array[]): Uint8Array => {
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

const buildDstasLockingScriptForOwnerField = ({
  ownerField,
  tokenIdHex,
  freezable,
  authorityServiceField,
  frozen = false,
}: {
  ownerField: Uint8Array;
  tokenIdHex: string;
  freezable: boolean;
  authorityServiceField: Uint8Array;
  frozen?: boolean;
}) => {
  const tokens = buildStas3FreezeMultisigTokens({
    owner: ownerField,
    actionData: null,
    redemptionPkh: fromHex(tokenIdHex),
    frozen,
    flags: buildStas3Flags({ freezable }),
    serviceFields: freezable ? [authorityServiceField] : [],
    optionalData: [],
  });
  return ScriptBuilder.fromTokens(tokens, ScriptType.dstas);
};

const computeStas30RequestedScriptHash = (
  lockingScript: ScriptBuilder,
): Uint8Array => {
  const tokens = lockingScript._tokens;
  if (tokens.length < 3) {
    throw new Error(
      "Divisible STAS locking script must include owner + second field",
    );
  }
  const tail = ScriptBuilder.fromTokens(tokens.slice(2), ScriptType.unknown);
  return sha256(tail.toBytes());
};

const swapDestination = ({
  satoshis,
  owner,
  tokenIdHex,
  freezable,
  authorityServiceField,
  actionData,
}: {
  satoshis: number;
  owner: Uint8Array;
  tokenIdHex: string;
  freezable: boolean;
  authorityServiceField: Uint8Array;
  actionData?: ReturnType<typeof buildSwapActionData> | null;
}) => ({
  Satoshis: satoshis,
  Owner: owner,
  TokenIdHex: tokenIdHex,
  Freezable: freezable,
  AuthorityServiceField: authorityServiceField,
  ActionData: actionData ?? null,
});

const buildOwnerMultisigUnlockingScript = ({
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
      const secondFieldToken = output.LockingScript._tokens[1];
      if (secondFieldToken?.Data) script.addData(secondFieldToken.Data);
      else if (secondFieldToken) script.addOpCode(secondFieldToken.OpCodeNum);
      else throw new Error("Divisible STAS output missing second field");
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

const buildRedeemTx = ({
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
  redeemAddress: OutPoint["Address"];
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
      feeOutPoint.Address,
      feeOutPoint.Satoshis,
      FeeRate,
      feeOutputIdx,
    )
    .sign()
    .toHex();
};

describe("dstas flow", () => {
  const createSwapContext = ({
    satoshisA = 100,
    satoshisB = 100,
    secondFieldA,
    secondFieldB,
    frozenA = false,
    frozenB = false,
  }: {
    satoshisA?: number;
    satoshisB?: number;
    secondFieldA: ReturnType<typeof buildSwapActionData> | null;
    secondFieldB: ReturnType<typeof buildSwapActionData> | null;
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
        authority: { m: 1, publicKeys: [toHex(bob.PublicKey)] },
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
          ActionData: secondFieldA,
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
          ActionData: secondFieldB,
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
      txIssueA.Outputs[0].LockignScript,
      txIssueA.Outputs[0].Satoshis,
      bob.Address,
      ScriptType.dstas,
    );
    stasA.Transaction = txIssueA;

    const stasB = new OutPoint(
      txIssueB.Id,
      0,
      txIssueB.Outputs[0].LockignScript,
      txIssueB.Outputs[0].Satoshis,
      cat.Address,
      ScriptType.dstas,
    );
    stasB.Transaction = txIssueB;

    const fee = new OutPoint(
      txIssueA.Id,
      1,
      txIssueA.Outputs[1].LockignScript,
      txIssueA.Outputs[1].Satoshis,
      bob.Address,
      ScriptType.p2pkh,
    );

    const resolvePrev = (txId: string, vout: number) => {
      if (txId === txIssueA.Id) {
        const out = txIssueA.Outputs[vout];
        if (out)
          return { lockingScript: out.LockignScript, satoshis: out.Satoshis };
      }
      if (txId === txIssueB.Id) {
        const out = txIssueB.Outputs[vout];
        if (out)
          return { lockingScript: out.LockignScript, satoshis: out.Satoshis };
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

  test(
    "reference transfer (P2PKH): stas input validates with preimage-derived prevout",
    () => {
      const txHex = readFileSync(referenceTransferTxPath, "utf8").trim();
      const tx = TransactionReader.readHex(txHex);
      const unlock = decomposeStas3UnlockingScript(
        tx.Inputs[0].UnlockingScript,
      );
      const lock = decomposeStas3LockingScript(tx.Outputs[0].LockignScript);

      const preimage = fromHex(unlock.preimageHex!);
      const reader = new ByteReader(preimage);
      reader.readUInt32();
      reader.readChunk(32);
      reader.readChunk(32);
      reader.readChunk(32);
      reader.readUInt32();
      const prevScript = reader.readVarChunk();
      const prevSatoshis = reader.readUInt64();

      const dummyFeeLock = Uint8Array.from([
        0x76,
        0xa9,
        0x14,
        ...Array(20).fill(0),
        0x88,
        0xac,
      ]);

      const evalInput0 = evaluateScripts(
        tx.Inputs[0].UnlockingScript,
        prevScript,
        {
          tx,
          inputIndex: 0,
          prevOutputs: [
            { lockingScript: prevScript, satoshis: prevSatoshis },
            { lockingScript: dummyFeeLock, satoshis: 1_000 },
          ],
        },
        { allowOpReturn: true, trace: true, traceLimit: 1_200 },
      );

      const decodedWif = bs58check.decode(
        "cSApidrMXZzYHTTmHRRNjCksbXZ7jhed1zK8Fg28Vg8XNgKcRCpS",
      );
      const signer = new PrivateKey(decodedWif.subarray(1, 33));

      expect(tx.Inputs.length).toBe(2);
      expect(tx.Outputs.length).toBe(1);
      expect(unlock.parsed).toBe(true);
      expect(unlock.spendingType).toBe(1);
      expect(unlock.authPlaceholderOpcodes).toEqual([0, 0, 0]);
      expect(unlock.signatureHex?.slice(-2)).toBe("41");
      expect(lock.flagsHex).toBe("aabb00");
      expect(lock.serviceFieldHexes.length).toBe(0);
      expect(lock.errors.length).toBe(0);
      expect(toHex(signer.PublicKey).toLowerCase()).toBe(
        unlock.publicKeyHex?.toLowerCase(),
      );
      expect(evalInput0.success).toBe(true);
    },
  );

  test("real funding: build contract + issue are valid", () => {
    const fixture = createRealFundingFlowFixture();

    const contractEval = evaluateTransactionHex(
      fixture.contractTxHex,
      (txId, vout) => {
        if (
          txId !== fixture.sourceFunding.TxId ||
          vout !== fixture.sourceFunding.Vout
        ) {
          return undefined;
        }
        return {
          lockingScript: fixture.sourceFunding.LockignScript,
          satoshis: fixture.sourceFunding.Satoshis,
        };
      },
      { allowOpReturn: true },
    );

    const issueEval = evaluateTransactionHex(
      fixture.issueTxHex,
      resolveFromTx(fixture.contractTxHex),
      { allowOpReturn: true },
    );

    expect(fixture.contractTx.Inputs.length).toBe(1);
    expect(fixture.contractTx.Outputs.length).toBe(2);
    expect(fixture.issueTx.Inputs.length).toBe(2);
    expect(fixture.issueTx.Outputs.length).toBe(2);
    expect(contractEval.success).toBe(true);
    expect(issueEval.success).toBe(true);
  });

  test("real funding: transfer no-change flow is valid", () => {
    const fixture = createRealFundingFlowFixture();
    const transferTxHex = buildTransferFromFixture(fixture, true);
    const transferTx = TransactionReader.readHex(transferTxHex);

    const transferEval = evaluateTransactionHex(
      transferTxHex,
      resolveFromTx(fixture.issueTxHex),
      { allowOpReturn: true },
    );

    dumpTransferDebug({
      transferTxHex,
      prevStasLockingScript: fixture.issueTx.Outputs[0].LockignScript,
      prevStasSatoshis: fixture.issueTx.Outputs[0].Satoshis,
      prevFeeLockingScript: fixture.issueTx.Outputs[1].LockignScript,
      prevFeeSatoshis: fixture.issueTx.Outputs[1].Satoshis,
      outPath: ".temp/dstas-transfer-no-change-debug.json",
    });

    expect(transferTx.Inputs.length).toBe(2);
    expect(transferTx.Outputs.length).toBe(1);
    expect(transferTx.Outputs[0].Satoshis).toBe(100);
    expect(transferEval.success).toBe(true);
    expect(transferEval.inputs.find((x) => x.inputIndex === 0)?.success).toBe(
      true,
    );
    expect(transferEval.inputs.find((x) => x.inputIndex === 1)?.success).toBe(
      true,
    );
  });

  test("real funding: swap cancel flow is valid", () => {
    const fixture = createRealFundingFlowFixture();

    const swapSecondField = buildSwapActionData({
      requestedScriptHash: new Uint8Array(32),
      requestedPkh: fixture.bob.Address.Hash160,
      rateNumerator: 0,
      rateDenominator: 0,
    });

    const { issueTxHex } = BuildDstasIssueTxs({
      fundingPayment: {
        OutPoint: fixture.sourceFunding,
        Owner: fixture.bob,
      },
      scheme: fixture.scheme,
      destinations: [
        {
          Satoshis: 100,
          To: fixture.bob.Address,
          ActionData: swapSecondField,
        },
      ],
      feeRate: FeeRate,
    });

    const issueTx = TransactionReader.readHex(issueTxHex);
    const stasOutPoint = new OutPoint(
      issueTx.Id,
      0,
      issueTx.Outputs[0].LockignScript,
      issueTx.Outputs[0].Satoshis,
      fixture.bob.Address,
      ScriptType.dstas,
    );
    const feeOutPoint = new OutPoint(
      issueTx.Id,
      1,
      issueTx.Outputs[1].LockignScript,
      issueTx.Outputs[1].Satoshis,
      fixture.bob.Address,
      ScriptType.p2pkh,
    );

    const swapTxHex = BuildDstasSwapTx({
      stasPayments: [
        {
          OutPoint: stasOutPoint,
          Owner: fixture.bob,
        },
      ],
      feePayment: {
        OutPoint: feeOutPoint,
        Owner: fixture.bob,
      },
      destinations: [
        {
          Satoshis: stasOutPoint.Satoshis,
          To: fixture.bob.Address,
          ActionData: swapSecondField,
        },
      ],
      Scheme: fixture.scheme,
      feeRate: FeeRate,
      omitChangeOutput: true,
    });

    const swapTx = TransactionReader.readHex(swapTxHex);
    const swapEval = evaluateTransactionHex(
      swapTxHex,
      resolveFromTx(issueTxHex),
      {
        allowOpReturn: true,
      },
    );

    expect(swapTx.Inputs.length).toBe(2);
    expect(swapTx.Outputs.length).toBe(1);
    expect(swapEval.success).toBe(true);
    expect(swapEval.inputs.find((x) => x.inputIndex === 0)?.success).toBe(true);
  });

  test("real funding: swap + transfer assets with requestedScriptHash/rate", () => {
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
        authority: { m: 1, publicKeys: [toHex(bob.PublicKey)] },
      },
    );

    const fundingA = createRealFundingOutPoint(bob);
    const fundingB = createRealFundingOutPoint(cat);

    const authorityA = hash160(cat.PublicKey);
    const authorityB = hash160(bob.PublicKey);
    const sampleATail = buildDstasLockingScriptForOwnerField({
      ownerField: bob.Address.Hash160,
      tokenIdHex: schemeA.TokenId,
      freezable: schemeA.Freeze,
      authorityServiceField: authorityA,
      frozen: false,
    });
    const sampleBTail = buildDstasLockingScriptForOwnerField({
      ownerField: cat.Address.Hash160,
      tokenIdHex: schemeB.TokenId,
      freezable: schemeB.Freeze,
      authorityServiceField: authorityB,
      frozen: false,
    });
    const requestedHashForA = computeStas30RequestedScriptHash(sampleBTail);

    const secondFieldA = buildSwapActionData({
      requestedScriptHash: requestedHashForA,
      requestedPkh: bob.Address.Hash160,
      rateNumerator: 1,
      rateDenominator: 1,
    });

    const issueA = BuildDstasIssueTxs({
      fundingPayment: { OutPoint: fundingA, Owner: bob },
      scheme: schemeA,
      destinations: [
        { Satoshis: 100, To: bob.Address, ActionData: secondFieldA },
      ],
      feeRate: FeeRate,
    });
    const issueB = BuildDstasIssueTxs({
      fundingPayment: { OutPoint: fundingB, Owner: cat },
      scheme: schemeB,
      destinations: [{ Satoshis: 100, To: cat.Address, ActionData: null }],
      feeRate: FeeRate,
    });

    const txIssueA = TransactionReader.readHex(issueA.issueTxHex);
    const txIssueB = TransactionReader.readHex(issueB.issueTxHex);
    const stasA = new OutPoint(
      txIssueA.Id,
      0,
      txIssueA.Outputs[0].LockignScript,
      txIssueA.Outputs[0].Satoshis,
      bob.Address,
      ScriptType.dstas,
    );
    stasA.Transaction = txIssueA;
    const stasB = new OutPoint(
      txIssueB.Id,
      0,
      txIssueB.Outputs[0].LockignScript,
      txIssueB.Outputs[0].Satoshis,
      cat.Address,
      ScriptType.dstas,
    );
    stasB.Transaction = txIssueB;
    const fee = new OutPoint(
      txIssueA.Id,
      1,
      txIssueA.Outputs[1].LockignScript,
      txIssueA.Outputs[1].Satoshis,
      bob.Address,
      ScriptType.p2pkh,
    );

    const swapTxHex = BuildDstasTransferSwapTx({
      stasPayments: [
        { OutPoint: stasA, Owner: bob },
        { OutPoint: stasB, Owner: cat },
      ],
      feePayment: { OutPoint: fee, Owner: bob },
      destinations: [
        swapDestination({
          satoshis: stasB.Satoshis,
          owner: bob.Address.Hash160,
          tokenIdHex: schemeB.TokenId,
          freezable: schemeB.Freeze,
          authorityServiceField: authorityB,
          actionData: null,
        }),
        swapDestination({
          satoshis: stasA.Satoshis,
          owner: cat.Address.Hash160,
          tokenIdHex: schemeA.TokenId,
          freezable: schemeA.Freeze,
          authorityServiceField: authorityA,
          actionData: null,
        }),
      ],
      feeRate: FeeRate,
      omitChangeOutput: true,
    });

    const swapEval = evaluateTransactionHex(
      swapTxHex,
      (txId, vout) => {
        if (txId === txIssueA.Id) {
          const out = txIssueA.Outputs[vout];
          if (out)
            return { lockingScript: out.LockignScript, satoshis: out.Satoshis };
        }
        if (txId === txIssueB.Id) {
          const out = txIssueB.Outputs[vout];
          if (out)
            return { lockingScript: out.LockignScript, satoshis: out.Satoshis };
        }
        return undefined;
      },
      { allowOpReturn: true },
    );
    const swapTx = TransactionReader.readHex(swapTxHex);
    const out0 = decomposeStas3LockingScript(swapTx.Outputs[0].LockignScript);
    const out1 = decomposeStas3LockingScript(swapTx.Outputs[1].LockignScript);
    expect(swapEval.success).toBe(true);
    expect(swapEval.inputs.find((x) => x.inputIndex === 0)?.success).toBe(true);
    expect(swapEval.inputs.find((x) => x.inputIndex === 1)?.success).toBe(true);
    expect(out0.actionData).toEqual({ kind: "opcode", opcode: 0 });
    expect(out1.actionData).toEqual({ kind: "opcode", opcode: 0 });
  });

  test("real funding: swap + swap assets with requestedScriptHash/rate", () => {
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
        authority: { m: 1, publicKeys: [toHex(bob.PublicKey)] },
      },
    );

    const fundingA = createRealFundingOutPoint(bob);
    const fundingB = createRealFundingOutPoint(cat);

    const authorityA = hash160(cat.PublicKey);
    const authorityB = hash160(bob.PublicKey);

    const sampleATail = buildDstasLockingScriptForOwnerField({
      ownerField: bob.Address.Hash160,
      tokenIdHex: schemeA.TokenId,
      freezable: schemeA.Freeze,
      authorityServiceField: authorityA,
      frozen: false,
    });
    const sampleBTail = buildDstasLockingScriptForOwnerField({
      ownerField: cat.Address.Hash160,
      tokenIdHex: schemeB.TokenId,
      freezable: schemeB.Freeze,
      authorityServiceField: authorityB,
      frozen: false,
    });

    const requestedHashForA = computeStas30RequestedScriptHash(sampleBTail);
    const requestedHashForB = computeStas30RequestedScriptHash(sampleATail);

    const secondFieldA = buildSwapActionData({
      requestedScriptHash: requestedHashForA,
      requestedPkh: bob.Address.Hash160,
      rateNumerator: 1,
      rateDenominator: 1,
    });
    const secondFieldB = buildSwapActionData({
      requestedScriptHash: requestedHashForB,
      requestedPkh: cat.Address.Hash160,
      rateNumerator: 1,
      rateDenominator: 1,
    });

    const issueA = BuildDstasIssueTxs({
      fundingPayment: { OutPoint: fundingA, Owner: bob },
      scheme: schemeA,
      destinations: [
        { Satoshis: 100, To: bob.Address, ActionData: secondFieldA },
      ],
      feeRate: FeeRate,
    });
    const issueB = BuildDstasIssueTxs({
      fundingPayment: { OutPoint: fundingB, Owner: cat },
      scheme: schemeB,
      destinations: [
        { Satoshis: 100, To: cat.Address, ActionData: secondFieldB },
      ],
      feeRate: FeeRate,
    });

    const txIssueA = TransactionReader.readHex(issueA.issueTxHex);
    const txIssueB = TransactionReader.readHex(issueB.issueTxHex);

    const stasA = new OutPoint(
      txIssueA.Id,
      0,
      txIssueA.Outputs[0].LockignScript,
      txIssueA.Outputs[0].Satoshis,
      bob.Address,
      ScriptType.dstas,
    );
    stasA.Transaction = txIssueA;

    const stasB = new OutPoint(
      txIssueB.Id,
      0,
      txIssueB.Outputs[0].LockignScript,
      txIssueB.Outputs[0].Satoshis,
      cat.Address,
      ScriptType.dstas,
    );
    stasB.Transaction = txIssueB;

    const fee = new OutPoint(
      txIssueA.Id,
      1,
      txIssueA.Outputs[1].LockignScript,
      txIssueA.Outputs[1].Satoshis,
      bob.Address,
      ScriptType.p2pkh,
    );

    const swapTxHex = BuildDstasSwapSwapTx({
      stasPayments: [
        { OutPoint: stasA, Owner: bob },
        { OutPoint: stasB, Owner: cat },
      ],
      feePayment: { OutPoint: fee, Owner: bob },
      destinations: [
        swapDestination({
          satoshis: stasB.Satoshis,
          owner: bob.Address.Hash160,
          tokenIdHex: schemeB.TokenId,
          freezable: schemeB.Freeze,
          authorityServiceField: authorityB,
          actionData: null,
        }),
        swapDestination({
          satoshis: stasA.Satoshis,
          owner: cat.Address.Hash160,
          tokenIdHex: schemeA.TokenId,
          freezable: schemeA.Freeze,
          authorityServiceField: authorityA,
          actionData: null,
        }),
      ],
      feeRate: FeeRate,
      omitChangeOutput: true,
    });

    const swapEval = evaluateTransactionHex(
      swapTxHex,
      (txId, vout) => {
        if (txId === txIssueA.Id) {
          const out = txIssueA.Outputs[vout];
          if (out)
            return { lockingScript: out.LockignScript, satoshis: out.Satoshis };
        }
        if (txId === txIssueB.Id) {
          const out = txIssueB.Outputs[vout];
          if (out)
            return { lockingScript: out.LockignScript, satoshis: out.Satoshis };
        }
        return undefined;
      },
      { allowOpReturn: true },
    );

    const swapTx = TransactionReader.readHex(swapTxHex);
    const out0 = decomposeStas3LockingScript(swapTx.Outputs[0].LockignScript);
    const out1 = decomposeStas3LockingScript(swapTx.Outputs[1].LockignScript);

    expect(swapEval.success).toBe(true);
    expect(swapEval.inputs.find((x) => x.inputIndex === 0)?.success).toBe(true);
    expect(swapEval.inputs.find((x) => x.inputIndex === 1)?.success).toBe(true);
    expect(out0.actionData).toEqual({ kind: "opcode", opcode: 0 });
    expect(out1.actionData).toEqual({ kind: "opcode", opcode: 0 });
  });

  test("real funding: swap + transfer with one remainder and fractional rate", () => {
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
        authority: { m: 1, publicKeys: [toHex(bob.PublicKey)] },
      },
    );
    const sampleBTail = buildDstasLockingScriptForOwnerField({
      ownerField: cat.Address.Hash160,
      tokenIdHex: schemeB.TokenId,
      freezable: schemeB.Freeze,
      authorityServiceField: hash160(bob.PublicKey),
      frozen: false,
    });
    const secondFieldA = buildSwapActionData({
      requestedScriptHash: computeStas30RequestedScriptHash(sampleBTail),
      requestedPkh: bob.Address.Hash160,
      rateNumerator: 1,
      rateDenominator: 2,
    });

    const ctx = createSwapContext({
      satoshisA: 100,
      satoshisB: 100,
      secondFieldA,
      secondFieldB: null,
    });

    const swapTxHex = BuildDstasTransferSwapTx({
      stasPayments: [
        { OutPoint: ctx.stasA, Owner: ctx.bob },
        { OutPoint: ctx.stasB, Owner: ctx.cat },
      ],
      feePayment: { OutPoint: ctx.fee, Owner: ctx.bob },
      destinations: [
        swapDestination({
          satoshis: 50,
          owner: ctx.bob.Address.Hash160,
          tokenIdHex: ctx.schemeB.TokenId,
          freezable: ctx.schemeB.Freeze,
          authorityServiceField: hash160(ctx.bob.PublicKey),
          actionData: null,
        }),
        swapDestination({
          satoshis: 100,
          owner: ctx.cat.Address.Hash160,
          tokenIdHex: ctx.schemeA.TokenId,
          freezable: ctx.schemeA.Freeze,
          authorityServiceField: hash160(ctx.cat.PublicKey),
          actionData: null,
        }),
        swapDestination({
          satoshis: 50,
          owner: ctx.cat.Address.Hash160,
          tokenIdHex: ctx.schemeB.TokenId,
          freezable: ctx.schemeB.Freeze,
          authorityServiceField: hash160(ctx.bob.PublicKey),
          actionData: null,
        }),
      ],
      feeRate: FeeRate,
      omitChangeOutput: true,
    });

    const evalResult = evaluateTransactionHex(swapTxHex, ctx.resolvePrev, {
      allowOpReturn: true,
    });
    expect(evalResult.success).toBe(true);
  });

  test("real funding: swap + swap with one remainder and fractional rate", () => {
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
        authority: { m: 1, publicKeys: [toHex(bob.PublicKey)] },
      },
    );
    const sampleATail = buildDstasLockingScriptForOwnerField({
      ownerField: bob.Address.Hash160,
      tokenIdHex: schemeA.TokenId,
      freezable: schemeA.Freeze,
      authorityServiceField: hash160(cat.PublicKey),
      frozen: false,
    });
    const sampleBTail = buildDstasLockingScriptForOwnerField({
      ownerField: cat.Address.Hash160,
      tokenIdHex: schemeB.TokenId,
      freezable: schemeB.Freeze,
      authorityServiceField: hash160(bob.PublicKey),
      frozen: false,
    });
    const secondFieldA = buildSwapActionData({
      requestedScriptHash: computeStas30RequestedScriptHash(sampleBTail),
      requestedPkh: bob.Address.Hash160,
      rateNumerator: 1,
      rateDenominator: 2,
    });
    const secondFieldB = buildSwapActionData({
      requestedScriptHash: computeStas30RequestedScriptHash(sampleATail),
      requestedPkh: cat.Address.Hash160,
      rateNumerator: 1,
      rateDenominator: 1,
    });
    const ctx = createSwapContext({
      satoshisA: 100,
      satoshisB: 100,
      secondFieldA,
      secondFieldB,
    });

    const swapTxHex = BuildDstasSwapSwapTx({
      stasPayments: [
        { OutPoint: ctx.stasA, Owner: ctx.bob },
        { OutPoint: ctx.stasB, Owner: ctx.cat },
      ],
      feePayment: { OutPoint: ctx.fee, Owner: ctx.bob },
      destinations: [
        swapDestination({
          satoshis: 50,
          owner: ctx.bob.Address.Hash160,
          tokenIdHex: ctx.schemeB.TokenId,
          freezable: ctx.schemeB.Freeze,
          authorityServiceField: hash160(ctx.bob.PublicKey),
          actionData: null,
        }),
        swapDestination({
          satoshis: 100,
          owner: ctx.cat.Address.Hash160,
          tokenIdHex: ctx.schemeA.TokenId,
          freezable: ctx.schemeA.Freeze,
          authorityServiceField: hash160(ctx.cat.PublicKey),
          actionData: null,
        }),
        swapDestination({
          satoshis: 50,
          owner: ctx.cat.Address.Hash160,
          tokenIdHex: ctx.schemeB.TokenId,
          freezable: ctx.schemeB.Freeze,
          authorityServiceField: hash160(ctx.bob.PublicKey),
          actionData: secondFieldB,
        }),
      ],
      feeRate: FeeRate,
      omitChangeOutput: true,
    });

    const evalResult = evaluateTransactionHex(swapTxHex, ctx.resolvePrev, {
      allowOpReturn: true,
    });
    expect(evalResult.success).toBe(true);
    expect(evalResult.inputs.find((x) => x.inputIndex === 0)?.success).toBe(
      true,
    );
    expect(evalResult.inputs.find((x) => x.inputIndex === 1)?.success).toBe(
      true,
    );
  });

  test("real funding: transfer + swap with two remainders and fractional rate", () => {
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
        authority: { m: 1, publicKeys: [toHex(bob.PublicKey)] },
      },
    );
    const sampleBTail = buildDstasLockingScriptForOwnerField({
      ownerField: cat.Address.Hash160,
      tokenIdHex: schemeB.TokenId,
      freezable: schemeB.Freeze,
      authorityServiceField: hash160(bob.PublicKey),
      frozen: false,
    });
    const secondFieldA = buildSwapActionData({
      requestedScriptHash: computeStas30RequestedScriptHash(sampleBTail),
      requestedPkh: bob.Address.Hash160,
      rateNumerator: 1,
      rateDenominator: 2,
    });
    const ctx = createSwapContext({
      satoshisA: 100,
      satoshisB: 100,
      secondFieldA,
      secondFieldB: null,
    });

    const swapTxHex = BuildDstasTransferSwapTx({
      stasPayments: [
        { OutPoint: ctx.stasA, Owner: ctx.bob },
        { OutPoint: ctx.stasB, Owner: ctx.cat },
      ],
      feePayment: { OutPoint: ctx.fee, Owner: ctx.bob },
      destinations: [
        swapDestination({
          satoshis: 40,
          owner: ctx.bob.Address.Hash160,
          tokenIdHex: ctx.schemeB.TokenId,
          freezable: ctx.schemeB.Freeze,
          authorityServiceField: hash160(ctx.bob.PublicKey),
          actionData: null,
        }),
        swapDestination({
          satoshis: 80,
          owner: ctx.cat.Address.Hash160,
          tokenIdHex: ctx.schemeA.TokenId,
          freezable: ctx.schemeA.Freeze,
          authorityServiceField: hash160(ctx.cat.PublicKey),
          actionData: null,
        }),
        swapDestination({
          satoshis: 20,
          owner: ctx.bob.Address.Hash160,
          tokenIdHex: ctx.schemeA.TokenId,
          freezable: ctx.schemeA.Freeze,
          authorityServiceField: hash160(ctx.cat.PublicKey),
          actionData: secondFieldA,
        }),
        swapDestination({
          satoshis: 60,
          owner: ctx.cat.Address.Hash160,
          tokenIdHex: ctx.schemeB.TokenId,
          freezable: ctx.schemeB.Freeze,
          authorityServiceField: hash160(ctx.bob.PublicKey),
          actionData: null,
        }),
      ],
      feeRate: FeeRate,
      omitChangeOutput: true,
    });

    const evalResult = evaluateTransactionHex(swapTxHex, ctx.resolvePrev, {
      allowOpReturn: true,
    });
    expect(evalResult.success).toBe(true);
  });

  test("real funding: swap + swap with two remainders and fractional rate", () => {
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
        authority: { m: 1, publicKeys: [toHex(bob.PublicKey)] },
      },
    );
    const sampleATail = buildDstasLockingScriptForOwnerField({
      ownerField: bob.Address.Hash160,
      tokenIdHex: schemeA.TokenId,
      freezable: schemeA.Freeze,
      authorityServiceField: hash160(cat.PublicKey),
      frozen: false,
    });
    const sampleBTail = buildDstasLockingScriptForOwnerField({
      ownerField: cat.Address.Hash160,
      tokenIdHex: schemeB.TokenId,
      freezable: schemeB.Freeze,
      authorityServiceField: hash160(bob.PublicKey),
      frozen: false,
    });
    const secondFieldA = buildSwapActionData({
      requestedScriptHash: computeStas30RequestedScriptHash(sampleBTail),
      requestedPkh: bob.Address.Hash160,
      rateNumerator: 1,
      rateDenominator: 2,
    });
    const secondFieldB = buildSwapActionData({
      requestedScriptHash: computeStas30RequestedScriptHash(sampleATail),
      requestedPkh: cat.Address.Hash160,
      rateNumerator: 1,
      rateDenominator: 1,
    });
    const ctx = createSwapContext({
      satoshisA: 100,
      satoshisB: 100,
      secondFieldA,
      secondFieldB,
    });

    const swapTxHex = BuildDstasSwapSwapTx({
      stasPayments: [
        { OutPoint: ctx.stasA, Owner: ctx.bob },
        { OutPoint: ctx.stasB, Owner: ctx.cat },
      ],
      feePayment: { OutPoint: ctx.fee, Owner: ctx.bob },
      destinations: [
        swapDestination({
          satoshis: 40,
          owner: ctx.bob.Address.Hash160,
          tokenIdHex: ctx.schemeB.TokenId,
          freezable: ctx.schemeB.Freeze,
          authorityServiceField: hash160(ctx.bob.PublicKey),
          actionData: null,
        }),
        swapDestination({
          satoshis: 80,
          owner: ctx.cat.Address.Hash160,
          tokenIdHex: ctx.schemeA.TokenId,
          freezable: ctx.schemeA.Freeze,
          authorityServiceField: hash160(ctx.cat.PublicKey),
          actionData: null,
        }),
        swapDestination({
          satoshis: 20,
          owner: ctx.bob.Address.Hash160,
          tokenIdHex: ctx.schemeA.TokenId,
          freezable: ctx.schemeA.Freeze,
          authorityServiceField: hash160(ctx.cat.PublicKey),
          actionData: secondFieldA,
        }),
        swapDestination({
          satoshis: 60,
          owner: ctx.cat.Address.Hash160,
          tokenIdHex: ctx.schemeB.TokenId,
          freezable: ctx.schemeB.Freeze,
          authorityServiceField: hash160(ctx.bob.PublicKey),
          actionData: secondFieldB,
        }),
      ],
      feeRate: FeeRate,
      omitChangeOutput: true,
    });

    const evalResult = evaluateTransactionHex(swapTxHex, ctx.resolvePrev, {
      allowOpReturn: true,
    });
    expect(evalResult.success).toBe(true);
    expect(evalResult.inputs.find((x) => x.inputIndex === 0)?.success).toBe(
      true,
    );
    expect(evalResult.inputs.find((x) => x.inputIndex === 1)?.success).toBe(
      true,
    );
  });

  test("real funding: swap + transfer rejects frozen swap input", () => {
    const bob = Wallet.fromMnemonic(
      "group spy extend supreme monkey judge avocado cancel exit educate modify bubble",
    ).deriveWallet("m/44'/236'/0'/0/0");
    const cat = Wallet.fromMnemonic(
      "group spy extend supreme monkey judge avocado cancel exit educate modify bubble",
    ).deriveWallet("m/44'/236'/0'/0/1");
    const schemeB = new TokenScheme(
      "Divisible STASB",
      toHex(cat.Address.Hash160),
      "S30B",
      1,
      {
        freeze: true,
        confiscation: true,
        isDivisible: true,
        authority: { m: 1, publicKeys: [toHex(bob.PublicKey)] },
      },
    );
    const sampleBTail = buildDstasLockingScriptForOwnerField({
      ownerField: cat.Address.Hash160,
      tokenIdHex: schemeB.TokenId,
      freezable: schemeB.Freeze,
      authorityServiceField: hash160(bob.PublicKey),
      frozen: false,
    });
    const secondFieldA = buildSwapActionData({
      requestedScriptHash: computeStas30RequestedScriptHash(sampleBTail),
      requestedPkh: bob.Address.Hash160,
      rateNumerator: 1,
      rateDenominator: 1,
    });
    const ctx = createSwapContext({
      satoshisA: 100,
      satoshisB: 100,
      secondFieldA,
      secondFieldB: null,
      frozenA: true,
    });

    const swapTxHex = BuildDstasTransferSwapTx({
      stasPayments: [
        { OutPoint: ctx.stasA, Owner: ctx.bob },
        { OutPoint: ctx.stasB, Owner: ctx.cat },
      ],
      feePayment: { OutPoint: ctx.fee, Owner: ctx.bob },
      destinations: [
        swapDestination({
          satoshis: 100,
          owner: ctx.bob.Address.Hash160,
          tokenIdHex: ctx.schemeB.TokenId,
          freezable: ctx.schemeB.Freeze,
          authorityServiceField: hash160(ctx.bob.PublicKey),
          actionData: null,
        }),
        swapDestination({
          satoshis: 100,
          owner: ctx.cat.Address.Hash160,
          tokenIdHex: ctx.schemeA.TokenId,
          freezable: ctx.schemeA.Freeze,
          authorityServiceField: hash160(ctx.cat.PublicKey),
          actionData: null,
        }),
      ],
      feeRate: FeeRate,
      omitChangeOutput: true,
    });

    const evalResult = evaluateTransactionHex(swapTxHex, ctx.resolvePrev, {
      allowOpReturn: true,
    });
    expect(evalResult.success).toBe(false);
  });

  test("real funding: swap + swap rejects frozen input", () => {
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
        authority: { m: 1, publicKeys: [toHex(bob.PublicKey)] },
      },
    );
    const sampleATail = buildDstasLockingScriptForOwnerField({
      ownerField: bob.Address.Hash160,
      tokenIdHex: schemeA.TokenId,
      freezable: schemeA.Freeze,
      authorityServiceField: hash160(cat.PublicKey),
      frozen: false,
    });
    const sampleBTail = buildDstasLockingScriptForOwnerField({
      ownerField: cat.Address.Hash160,
      tokenIdHex: schemeB.TokenId,
      freezable: schemeB.Freeze,
      authorityServiceField: hash160(bob.PublicKey),
      frozen: false,
    });
    const secondFieldA = buildSwapActionData({
      requestedScriptHash: computeStas30RequestedScriptHash(sampleBTail),
      requestedPkh: bob.Address.Hash160,
      rateNumerator: 1,
      rateDenominator: 1,
    });
    const secondFieldB = buildSwapActionData({
      requestedScriptHash: computeStas30RequestedScriptHash(sampleATail),
      requestedPkh: cat.Address.Hash160,
      rateNumerator: 1,
      rateDenominator: 1,
    });
    const ctx = createSwapContext({
      satoshisA: 100,
      satoshisB: 100,
      secondFieldA,
      secondFieldB,
      frozenB: true,
    });

    const swapTxHex = BuildDstasSwapSwapTx({
      stasPayments: [
        { OutPoint: ctx.stasA, Owner: ctx.bob },
        { OutPoint: ctx.stasB, Owner: ctx.cat },
      ],
      feePayment: { OutPoint: ctx.fee, Owner: ctx.bob },
      destinations: [
        swapDestination({
          satoshis: 100,
          owner: ctx.bob.Address.Hash160,
          tokenIdHex: ctx.schemeB.TokenId,
          freezable: ctx.schemeB.Freeze,
          authorityServiceField: hash160(ctx.bob.PublicKey),
          actionData: null,
        }),
        swapDestination({
          satoshis: 100,
          owner: ctx.cat.Address.Hash160,
          tokenIdHex: ctx.schemeA.TokenId,
          freezable: ctx.schemeA.Freeze,
          authorityServiceField: hash160(ctx.cat.PublicKey),
          actionData: null,
        }),
      ],
      feeRate: FeeRate,
      omitChangeOutput: true,
    });

    const evalResult = evaluateTransactionHex(swapTxHex, ctx.resolvePrev, {
      allowOpReturn: true,
    });
    expect(evalResult.success).toBe(false);
  });

  test("real funding: transfer with-change flow (current failing case)", () => {
    const fixture = createRealFundingFlowFixture();
    const transferTxHex = buildTransferFromFixture(fixture, false);
    const transferTx = TransactionReader.readHex(transferTxHex);

    const transferEval = evaluateTransactionHex(
      transferTxHex,
      resolveFromTx(fixture.issueTxHex),
      { allowOpReturn: true },
    );

    const unlock = decomposeStas3UnlockingScript(
      transferTx.Inputs[0].UnlockingScript,
    );

    dumpTransferDebug({
      transferTxHex,
      prevStasLockingScript: fixture.issueTx.Outputs[0].LockignScript,
      prevStasSatoshis: fixture.issueTx.Outputs[0].Satoshis,
      prevFeeLockingScript: fixture.issueTx.Outputs[1].LockignScript,
      prevFeeSatoshis: fixture.issueTx.Outputs[1].Satoshis,
      outPath: ".temp/dstas-transfer-with-change-debug.json",
    });

    expect(transferTx.Inputs.length).toBe(2);
    expect(transferTx.Outputs.length).toBe(2);
    expect(unlock.parsed).toBe(true);
    expect(unlock.spendingType).toBe(1);
    expect(transferEval.success).toBe(true);
  });

  test("real funding: transfer to owner-multisig output is valid", () => {
    const fixture = createRealFundingFlowFixture();
    const multisigTransferTxHex = BuildDstasTransferTx({
      stasPayment: {
        OutPoint: fixture.stasOutPoint,
        Owner: fixture.alice,
      },
      feePayment: {
        OutPoint: fixture.feeOutPoint,
        Owner: fixture.bob,
      },
      Scheme: fixture.scheme,
      destination: {
        Satoshis: fixture.stasOutPoint.Satoshis,
        ToOwnerMultisig: {
          m: 2,
          publicKeys: [
            toHex(fixture.bob.PublicKey),
            toHex(fixture.cat.PublicKey),
            toHex(fixture.alice.PublicKey),
          ],
        },
      },
      omitChangeOutput: true,
    });

    const evalResult = evaluateTransactionHex(
      multisigTransferTxHex,
      resolveFromTx(fixture.issueTxHex),
      { allowOpReturn: true },
    );
    const tx = TransactionReader.readHex(multisigTransferTxHex);

    expect(evalResult.success).toBe(true);
    expect(tx.Outputs[0].ScriptType).toBe(ScriptType.dstas);
    expect(tx.Outputs[0].Address).toBeDefined();
  });

  test("real funding: owner-multisig can spend token with m-of-n unlocking", () => {
    const fixture = createRealFundingFlowFixture();
    const ownerPubKeys = [
      fixture.bob.PublicKey,
      fixture.cat.PublicKey,
      fixture.alice.PublicKey,
    ];
    const ownerThreshold = 2;
    const ownerMlpkh = hash160(
      buildMlpkhPreimage(ownerThreshold, ownerPubKeys),
    );

    const toOwnerMultisigTxHex = BuildDstasTransferTx({
      stasPayment: {
        OutPoint: fixture.stasOutPoint,
        Owner: fixture.alice,
      },
      feePayment: {
        OutPoint: fixture.feeOutPoint,
        Owner: fixture.bob,
      },
      Scheme: fixture.scheme,
      destination: {
        Satoshis: fixture.stasOutPoint.Satoshis,
        ToOwnerMultisig: {
          m: ownerThreshold,
          publicKeys: ownerPubKeys.map((x) => toHex(x)),
        },
      },
    });

    const prevTx = TransactionReader.readHex(toOwnerMultisigTxHex);
    const stasOutPoint = new OutPoint(
      prevTx.Id,
      0,
      prevTx.Outputs[0].LockignScript,
      prevTx.Outputs[0].Satoshis,
      new Address(ownerMlpkh),
      ScriptType.dstas,
    );
    const feeOutPoint = new OutPoint(
      prevTx.Id,
      1,
      prevTx.Outputs[1].LockignScript,
      prevTx.Outputs[1].Satoshis,
      fixture.bob.Address,
      ScriptType.p2pkh,
    );

    const authorityServiceField = hash160(fixture.cat.PublicKey);
    const transferOutLock = buildDstasLockingScriptForOwnerField({
      ownerField: fixture.bob.Address.Hash160,
      tokenIdHex: fixture.scheme.TokenId,
      freezable: fixture.scheme.Freeze,
      authorityServiceField,
      frozen: false,
    });

    const txBuilder = TransactionBuilder.init()
      .addInput(stasOutPoint, fixture.bob)
      .addInput(feeOutPoint, fixture.bob);

    txBuilder.Outputs.push(
      new OutputBuilder(transferOutLock, stasOutPoint.Satoshis),
    );

    txBuilder.Inputs[0].UnlockingScript = buildOwnerMultisigUnlockingScript({
      txBuilder,
      stasInputIndex: 0,
      spendingType: 1,
      signers: [fixture.bob, fixture.cat],
      pubKeys: ownerPubKeys,
      threshold: ownerThreshold,
    });

    const spendTxHex = txBuilder.sign().toHex();
    const evalResult = evaluateTransactionHex(
      spendTxHex,
      resolveFromTx(toOwnerMultisigTxHex),
      { allowOpReturn: true },
    );

    expect(evalResult.success).toBe(true);
    expect(evalResult.inputs.find((x) => x.inputIndex === 0)?.success).toBe(
      true,
    );
  });

  test("real funding: fee is within expected range for built Divisible STAS steps", () => {
    const fixture = createRealFundingFlowFixture();

    assertFeeInRange(
      fixture.contractTxHex,
      (txId, vout) => {
        if (
          txId !== fixture.sourceFunding.TxId ||
          vout !== fixture.sourceFunding.Vout
        ) {
          return undefined;
        }
        return {
          lockingScript: fixture.sourceFunding.LockignScript,
          satoshis: fixture.sourceFunding.Satoshis,
        };
      },
      FeeRate,
      1,
    );
    assertFeeInRange(
      fixture.issueTxHex,
      resolveFromTx(fixture.contractTxHex),
      FeeRate,
      2,
    );

    const transferTxHex = buildTransferFromFixture(fixture, false);
    assertFeeInRange(
      transferTxHex,
      resolveFromTx(fixture.issueTxHex),
      FeeRate,
      2,
    );

    const freezeTxHex = buildFreezeFromFixture(fixture);
    assertFeeInRange(
      freezeTxHex,
      resolveFromTx(fixture.issueTxHex),
      FeeRate,
      2,
    );

    const freezeTx = TransactionReader.readHex(freezeTxHex);
    const frozenStasOutPoint = new OutPoint(
      freezeTx.Id,
      0,
      freezeTx.Outputs[0].LockignScript,
      freezeTx.Outputs[0].Satoshis,
      fixture.alice.Address,
      ScriptType.dstas,
    );
    const frozenFeeOutPoint = new OutPoint(
      freezeTx.Id,
      1,
      freezeTx.Outputs[1].LockignScript,
      freezeTx.Outputs[1].Satoshis,
      fixture.bob.Address,
      ScriptType.p2pkh,
    );

    const unfreezeTxHex = BuildDstasUnfreezeTx({
      stasPayments: [
        {
          OutPoint: frozenStasOutPoint,
          Owner: fixture.cat,
        },
      ],
      feePayment: {
        OutPoint: frozenFeeOutPoint,
        Owner: fixture.bob,
      },
      destinations: [
        {
          Satoshis: frozenStasOutPoint.Satoshis,
          To: fixture.alice.Address,
          Frozen: false,
        },
      ],
      Scheme: fixture.scheme,
    });

    assertFeeInRange(unfreezeTxHex, resolveFromTx(freezeTxHex), FeeRate, 2);
  });

  test("real funding: freeze flow is valid", () => {
    const fixture = createRealFundingFlowFixture();
    const freezeTxHex = buildFreezeFromFixture(fixture);
    const freezeTx = TransactionReader.readHex(freezeTxHex);

    const freezeEval = evaluateTransactionHex(
      freezeTxHex,
      resolveFromTx(fixture.issueTxHex),
      { allowOpReturn: true },
    );

    expect(freezeTx.Inputs.length).toBe(2);
    expect(freezeTx.Outputs.length).toBe(2);
    expect(freezeTx.Outputs[0].Satoshis).toBe(fixture.stasOutPoint.Satoshis);
    expect(freezeEval.success).toBe(true);
    expect(freezeEval.inputs.find((x) => x.inputIndex === 0)?.success).toBe(
      true,
    );
    expect(freezeEval.inputs.find((x) => x.inputIndex === 1)?.success).toBe(
      true,
    );
  });

  test("real funding: owner cannot spend frozen utxo", () => {
    const fixture = createRealFundingFlowFixture();
    const freezeTxHex = buildFreezeFromFixture(fixture);
    const freezeTx = TransactionReader.readHex(freezeTxHex);

    const frozenStasOutPoint = new OutPoint(
      freezeTx.Id,
      0,
      freezeTx.Outputs[0].LockignScript,
      freezeTx.Outputs[0].Satoshis,
      fixture.alice.Address,
      ScriptType.dstas,
    );

    const feeOutPoint = new OutPoint(
      freezeTx.Id,
      1,
      freezeTx.Outputs[1].LockignScript,
      freezeTx.Outputs[1].Satoshis,
      fixture.bob.Address,
      ScriptType.p2pkh,
    );

    const spendFrozenTxHex = BuildDstasTransferTx({
      stasPayment: {
        OutPoint: frozenStasOutPoint,
        Owner: fixture.alice,
      },
      feePayment: {
        OutPoint: feeOutPoint,
        Owner: fixture.bob,
      },
      Scheme: fixture.scheme,
      destination: {
        Satoshis: frozenStasOutPoint.Satoshis,
        To: fixture.bob.Address,
      },
      omitChangeOutput: true,
    });

    const spendFrozenEval = evaluateTransactionHex(
      spendFrozenTxHex,
      resolveFromTx(freezeTxHex),
      { allowOpReturn: true },
    );

    expect(spendFrozenEval.success).toBe(false);
    expect(
      spendFrozenEval.inputs.find((x) => x.inputIndex === 0)?.success,
    ).toBe(false);
  });

  test("real funding: unfreeze flow is valid", () => {
    const fixture = createRealFundingFlowFixture();
    const freezeTxHex = buildFreezeFromFixture(fixture);
    const freezeTx = TransactionReader.readHex(freezeTxHex);

    const frozenStasOutPoint = new OutPoint(
      freezeTx.Id,
      0,
      freezeTx.Outputs[0].LockignScript,
      freezeTx.Outputs[0].Satoshis,
      fixture.alice.Address,
      ScriptType.dstas,
    );

    const feeOutPoint = new OutPoint(
      freezeTx.Id,
      1,
      freezeTx.Outputs[1].LockignScript,
      freezeTx.Outputs[1].Satoshis,
      fixture.bob.Address,
      ScriptType.p2pkh,
    );

    const unfreezeTxHex = BuildDstasUnfreezeTx({
      stasPayments: [
        {
          OutPoint: frozenStasOutPoint,
          Owner: fixture.cat,
        },
      ],
      feePayment: {
        OutPoint: feeOutPoint,
        Owner: fixture.bob,
      },
      destinations: [
        {
          Satoshis: frozenStasOutPoint.Satoshis,
          To: fixture.alice.Address,
          Frozen: false,
        },
      ],
      Scheme: fixture.scheme,
    });

    const unfreezeTx = TransactionReader.readHex(unfreezeTxHex);
    const unfreezeEval = evaluateTransactionHex(
      unfreezeTxHex,
      resolveFromTx(freezeTxHex),
      { allowOpReturn: true },
    );

    expect(unfreezeTx.Inputs.length).toBe(2);
    expect(unfreezeTx.Outputs.length).toBe(2);
    expect(unfreezeTx.Outputs[0].Satoshis).toBe(frozenStasOutPoint.Satoshis);
    expect(unfreezeEval.success).toBe(true);
    expect(unfreezeEval.inputs.find((x) => x.inputIndex === 0)?.success).toBe(
      true,
    );
    expect(unfreezeEval.inputs.find((x) => x.inputIndex === 1)?.success).toBe(
      true,
    );
  });

  test("real funding: owner can spend unfrozen utxo", () => {
    const fixture = createRealFundingFlowFixture();
    const freezeTxHex = buildFreezeFromFixture(fixture);
    const freezeTx = TransactionReader.readHex(freezeTxHex);

    const frozenStasOutPoint = new OutPoint(
      freezeTx.Id,
      0,
      freezeTx.Outputs[0].LockignScript,
      freezeTx.Outputs[0].Satoshis,
      fixture.alice.Address,
      ScriptType.dstas,
    );

    const freezeFeeOutPoint = new OutPoint(
      freezeTx.Id,
      1,
      freezeTx.Outputs[1].LockignScript,
      freezeTx.Outputs[1].Satoshis,
      fixture.bob.Address,
      ScriptType.p2pkh,
    );

    const unfreezeTxHex = BuildDstasUnfreezeTx({
      stasPayments: [
        {
          OutPoint: frozenStasOutPoint,
          Owner: fixture.cat,
        },
      ],
      feePayment: {
        OutPoint: freezeFeeOutPoint,
        Owner: fixture.bob,
      },
      destinations: [
        {
          Satoshis: frozenStasOutPoint.Satoshis,
          To: fixture.alice.Address,
          Frozen: false,
        },
      ],
      Scheme: fixture.scheme,
    });
    const unfreezeTx = TransactionReader.readHex(unfreezeTxHex);

    const unfrozenStasOutPoint = new OutPoint(
      unfreezeTx.Id,
      0,
      unfreezeTx.Outputs[0].LockignScript,
      unfreezeTx.Outputs[0].Satoshis,
      fixture.alice.Address,
      ScriptType.dstas,
    );
    const unfreezeFeeOutPoint = new OutPoint(
      unfreezeTx.Id,
      1,
      unfreezeTx.Outputs[1].LockignScript,
      unfreezeTx.Outputs[1].Satoshis,
      fixture.bob.Address,
      ScriptType.p2pkh,
    );

    const spendUnfrozenTxHex = BuildDstasTransferTx({
      stasPayment: {
        OutPoint: unfrozenStasOutPoint,
        Owner: fixture.alice,
      },
      feePayment: {
        OutPoint: unfreezeFeeOutPoint,
        Owner: fixture.bob,
      },
      Scheme: fixture.scheme,
      destination: {
        Satoshis: unfrozenStasOutPoint.Satoshis,
        To: fixture.bob.Address,
      },
      omitChangeOutput: true,
    });
    const spendUnfrozenEval = evaluateTransactionHex(
      spendUnfrozenTxHex,
      resolveFromTx(unfreezeTxHex),
      { allowOpReturn: true },
    );

    expect(spendUnfrozenEval.success).toBe(true);
    expect(
      spendUnfrozenEval.inputs.find((x) => x.inputIndex === 0)?.success,
    ).toBe(true);
    expect(
      spendUnfrozenEval.inputs.find((x) => x.inputIndex === 1)?.success,
    ).toBe(true);
  });

  test("real funding: theft attempt fails when non-owner signs STAS input", () => {
    const fixture = createRealFundingFlowFixture();

    const stolenStasTxHex = BuildDstasTransferTx({
      stasPayment: {
        OutPoint: fixture.stasOutPoint,
        // Attacker tries to spend Alice-owned STAS.
        Owner: fixture.bob,
      },
      feePayment: {
        OutPoint: fixture.feeOutPoint,
        Owner: fixture.bob,
      },
      Scheme: fixture.scheme,
      destination: {
        Satoshis: fixture.stasOutPoint.Satoshis,
        To: fixture.bob.Address,
      },
      omitChangeOutput: true,
    });

    const stolenEval = evaluateTransactionHex(
      stolenStasTxHex,
      resolveFromTx(fixture.issueTxHex),
      { allowOpReturn: true },
    );

    expect(stolenEval.success).toBe(false);
    expect(stolenEval.inputs.find((x) => x.inputIndex === 0)?.success).toBe(
      false,
    );
  });

  test("real funding: theft attempt fails when non-owner signs fee input", () => {
    const fixture = createRealFundingFlowFixture();

    const stolenFeeTxHex = BuildDstasTransferTx({
      stasPayment: {
        OutPoint: fixture.stasOutPoint,
        Owner: fixture.alice,
      },
      feePayment: {
        OutPoint: fixture.feeOutPoint,
        // Attacker tries to spend Bob-owned fee UTXO.
        Owner: fixture.cat,
      },
      Scheme: fixture.scheme,
      destination: {
        Satoshis: fixture.stasOutPoint.Satoshis,
        To: fixture.bob.Address,
      },
      omitChangeOutput: true,
    });

    const stolenEval = evaluateTransactionHex(
      stolenFeeTxHex,
      resolveFromTx(fixture.issueTxHex),
      { allowOpReturn: true },
    );

    expect(stolenEval.success).toBe(false);
    expect(stolenEval.inputs.find((x) => x.inputIndex === 1)?.success).toBe(
      false,
    );
  });

  test("real funding: redeem by non-issuer is rejected", () => {
    const fixture = createRealFundingFlowFixture();
    const stasOutPoint = fixture.stasOutPoint;
    const feeOutPoint = fixture.feeOutPoint;

    const redeemTxHex = buildRedeemTx({
      stasOutPoint,
      stasOwner: fixture.alice,
      feeOutPoint,
      feeOwner: fixture.bob,
      redeemAddress: fixture.bob.Address,
    });

    const redeemEval = evaluateTransactionHex(
      redeemTxHex,
      resolveFromTx(fixture.issueTxHex),
      { allowOpReturn: true },
    );

    expect(redeemEval.success).toBe(false);
    expect(redeemEval.inputs.find((x) => x.inputIndex === 0)?.success).toBe(
      false,
    );
  });

  test.todo(
    "real funding: issuer can redeem after receiving token (requires confirmed redeem unlocking format for Divisible STAS)",
  );

  test.todo(
    "real funding flow continuation: issue -> transfer -> freeze -> unfreeze -> redeem with on-chain fixtures",
  );
});
