import { Wallet } from "../src/bitcoin/wallet";
import { TokenScheme } from "../src/bitcoin/token-scheme";
import { toHex } from "../src/bytes";
import { OutPoint, ScriptType } from "../src/bitcoin";
import {
  buildDstasLockingScriptForOwnerField,
  buildSwapActionData,
  computeDstasRequestedScriptHash,
  decomposeDstasLockingScript,
  decomposeDstasUnlockingScript,
  evaluateTransactionHex,
} from "../src/script";
import {
  BuildDstasIssueTxs,
  BuildDstasSwapSwapTx,
  BuildDstasSwapTx,
  BuildDstasTransferSwapTx,
} from "../src/dstas-factory";
import { FeeRate } from "../src/transaction-factory";
import {
  createDefaultDstasScheme,
  createRealFundingFlowFixture,
  createRealFundingOutPoint,
} from "./helpers/dstas-flow-helpers";
import {
  createSwapContext,
  resolveFromTx,
  swapDestination,
} from "./helpers/dstas-flow-shared";
import { hash160 } from "../src/hashes";
import { TransactionReader } from "../src/transaction/read/transaction-reader";

describe("dstas swap flows", () => {
  test("real funding: swap cancel flow is valid", () => {
    const fixture = createRealFundingFlowFixture();

    const swapActionData = buildSwapActionData({
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
          ActionData: swapActionData,
        },
      ],
      feeRate: FeeRate,
    });

    const issueTx = TransactionReader.readHex(issueTxHex);
    const stasOutPoint = new OutPoint(
      issueTx.Id,
      0,
      issueTx.Outputs[0].LockingScript,
      issueTx.Outputs[0].Satoshis,
      fixture.bob.Address,
      ScriptType.dstas,
    );
    const feeOutPoint = new OutPoint(
      issueTx.Id,
      1,
      issueTx.Outputs[1].LockingScript,
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
          ActionData: swapActionData,
        },
      ],
      scheme: fixture.scheme,
      feeRate: FeeRate,
      omitChangeOutput: true,
    });

    const swapTx = TransactionReader.readHex(swapTxHex);
    const swapUnlock = decomposeDstasUnlockingScript(
      swapTx.Inputs[0].UnlockingScript!,
    );
    const swapEval = evaluateTransactionHex(
      swapTxHex,
      resolveFromTx(issueTxHex),
      {
        allowOpReturn: true,
      },
    );

    expect(swapTx.Inputs.length).toBe(2);
    expect(swapTx.Outputs.length).toBe(1);
    expect(swapUnlock.parsed).toBe(true);
    expect(swapUnlock.spendingType).toBe(4);
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
        freezeAuthority: { m: 1, publicKeys: [toHex(bob.PublicKey)] },
        confiscationAuthority: { m: 1, publicKeys: [toHex(bob.PublicKey)] },
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
      confiscatable: schemeA.Confiscation,
      authorityServiceField: authorityA,
      confiscationAuthorityServiceField: authorityA,
      frozen: false,
    });
    const sampleBTail = buildDstasLockingScriptForOwnerField({
      ownerField: cat.Address.Hash160,
      tokenIdHex: schemeB.TokenId,
      freezable: schemeB.Freeze,
      confiscatable: schemeB.Confiscation,
      authorityServiceField: authorityB,
      confiscationAuthorityServiceField: authorityB,
      frozen: false,
    });
    const requestedHashForA = computeDstasRequestedScriptHash(sampleBTail);

    const actionDataA = buildSwapActionData({
      requestedScriptHash: requestedHashForA,
      requestedPkh: bob.Address.Hash160,
      rateNumerator: 1,
      rateDenominator: 1,
    });

    const issueA = BuildDstasIssueTxs({
      fundingPayment: { OutPoint: fundingA, Owner: bob },
      scheme: schemeA,
      destinations: [
        { Satoshis: 100, To: bob.Address, ActionData: actionDataA },
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
          confiscatable: schemeB.Confiscation,
          authorityServiceField: authorityB,
          confiscationAuthorityServiceField: authorityB,
          actionData: null,
        }),
        swapDestination({
          satoshis: stasA.Satoshis,
          owner: cat.Address.Hash160,
          tokenIdHex: schemeA.TokenId,
          freezable: schemeA.Freeze,
          confiscatable: schemeA.Confiscation,
          authorityServiceField: authorityA,
          confiscationAuthorityServiceField: authorityA,
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
            return { lockingScript: out.LockingScript, satoshis: out.Satoshis };
        }
        if (txId === txIssueB.Id) {
          const out = txIssueB.Outputs[vout];
          if (out)
            return { lockingScript: out.LockingScript, satoshis: out.Satoshis };
        }
        return undefined;
      },
      { allowOpReturn: true },
    );
    const swapTx = TransactionReader.readHex(swapTxHex);
    const out0 = decomposeDstasLockingScript(swapTx.Outputs[0].LockingScript);
    const out1 = decomposeDstasLockingScript(swapTx.Outputs[1].LockingScript);
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
        freezeAuthority: { m: 1, publicKeys: [toHex(bob.PublicKey)] },
        confiscationAuthority: { m: 1, publicKeys: [toHex(bob.PublicKey)] },
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
      confiscatable: schemeA.Confiscation,
      authorityServiceField: authorityA,
      confiscationAuthorityServiceField: authorityA,
      frozen: false,
    });
    const sampleBTail = buildDstasLockingScriptForOwnerField({
      ownerField: cat.Address.Hash160,
      tokenIdHex: schemeB.TokenId,
      freezable: schemeB.Freeze,
      confiscatable: schemeB.Confiscation,
      authorityServiceField: authorityB,
      confiscationAuthorityServiceField: authorityB,
      frozen: false,
    });

    const requestedHashForA = computeDstasRequestedScriptHash(sampleBTail);
    const requestedHashForB = computeDstasRequestedScriptHash(sampleATail);

    const actionDataA = buildSwapActionData({
      requestedScriptHash: requestedHashForA,
      requestedPkh: bob.Address.Hash160,
      rateNumerator: 1,
      rateDenominator: 1,
    });
    const actionDataB = buildSwapActionData({
      requestedScriptHash: requestedHashForB,
      requestedPkh: cat.Address.Hash160,
      rateNumerator: 1,
      rateDenominator: 1,
    });

    const issueA = BuildDstasIssueTxs({
      fundingPayment: { OutPoint: fundingA, Owner: bob },
      scheme: schemeA,
      destinations: [
        { Satoshis: 100, To: bob.Address, ActionData: actionDataA },
      ],
      feeRate: FeeRate,
    });
    const issueB = BuildDstasIssueTxs({
      fundingPayment: { OutPoint: fundingB, Owner: cat },
      scheme: schemeB,
      destinations: [
        { Satoshis: 100, To: cat.Address, ActionData: actionDataB },
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
          confiscatable: schemeB.Confiscation,
          authorityServiceField: authorityB,
          confiscationAuthorityServiceField: authorityB,
          actionData: null,
        }),
        swapDestination({
          satoshis: stasA.Satoshis,
          owner: cat.Address.Hash160,
          tokenIdHex: schemeA.TokenId,
          freezable: schemeA.Freeze,
          confiscatable: schemeA.Confiscation,
          authorityServiceField: authorityA,
          confiscationAuthorityServiceField: authorityA,
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
            return { lockingScript: out.LockingScript, satoshis: out.Satoshis };
        }
        if (txId === txIssueB.Id) {
          const out = txIssueB.Outputs[vout];
          if (out)
            return { lockingScript: out.LockingScript, satoshis: out.Satoshis };
        }
        return undefined;
      },
      { allowOpReturn: true },
    );

    const swapTx = TransactionReader.readHex(swapTxHex);
    const out0 = decomposeDstasLockingScript(swapTx.Outputs[0].LockingScript);
    const out1 = decomposeDstasLockingScript(swapTx.Outputs[1].LockingScript);

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
        freezeAuthority: { m: 1, publicKeys: [toHex(bob.PublicKey)] },
        confiscationAuthority: { m: 1, publicKeys: [toHex(bob.PublicKey)] },
      },
    );
    const sampleBTail = buildDstasLockingScriptForOwnerField({
      ownerField: cat.Address.Hash160,
      tokenIdHex: schemeB.TokenId,
      freezable: schemeB.Freeze,
      confiscatable: schemeB.Confiscation,
      authorityServiceField: hash160(bob.PublicKey),
      confiscationAuthorityServiceField: hash160(bob.PublicKey),
      frozen: false,
    });
    const actionDataA = buildSwapActionData({
      requestedScriptHash: computeDstasRequestedScriptHash(sampleBTail),
      requestedPkh: bob.Address.Hash160,
      rateNumerator: 1,
      rateDenominator: 2,
    });

    const ctx = createSwapContext({
      satoshisA: 100,
      satoshisB: 100,
      actionDataA,
      actionDataB: null,
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
          confiscatable: ctx.schemeB.Confiscation,
          authorityServiceField: hash160(ctx.bob.PublicKey),
          confiscationAuthorityServiceField: hash160(ctx.bob.PublicKey),
          actionData: null,
        }),
        swapDestination({
          satoshis: 100,
          owner: ctx.cat.Address.Hash160,
          tokenIdHex: ctx.schemeA.TokenId,
          freezable: ctx.schemeA.Freeze,
          confiscatable: ctx.schemeA.Confiscation,
          authorityServiceField: hash160(ctx.cat.PublicKey),
          confiscationAuthorityServiceField: hash160(ctx.cat.PublicKey),
          actionData: null,
        }),
        swapDestination({
          satoshis: 50,
          owner: ctx.cat.Address.Hash160,
          tokenIdHex: ctx.schemeB.TokenId,
          freezable: ctx.schemeB.Freeze,
          confiscatable: ctx.schemeB.Confiscation,
          authorityServiceField: hash160(ctx.bob.PublicKey),
          confiscationAuthorityServiceField: hash160(ctx.bob.PublicKey),
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
        freezeAuthority: { m: 1, publicKeys: [toHex(bob.PublicKey)] },
        confiscationAuthority: { m: 1, publicKeys: [toHex(bob.PublicKey)] },
      },
    );
    const sampleATail = buildDstasLockingScriptForOwnerField({
      ownerField: bob.Address.Hash160,
      tokenIdHex: schemeA.TokenId,
      freezable: schemeA.Freeze,
      confiscatable: schemeA.Confiscation,
      authorityServiceField: hash160(cat.PublicKey),
      confiscationAuthorityServiceField: hash160(cat.PublicKey),
      frozen: false,
    });
    const sampleBTail = buildDstasLockingScriptForOwnerField({
      ownerField: cat.Address.Hash160,
      tokenIdHex: schemeB.TokenId,
      freezable: schemeB.Freeze,
      confiscatable: schemeB.Confiscation,
      authorityServiceField: hash160(bob.PublicKey),
      confiscationAuthorityServiceField: hash160(bob.PublicKey),
      frozen: false,
    });
    const actionDataA = buildSwapActionData({
      requestedScriptHash: computeDstasRequestedScriptHash(sampleBTail),
      requestedPkh: bob.Address.Hash160,
      rateNumerator: 1,
      rateDenominator: 2,
    });
    const actionDataB = buildSwapActionData({
      requestedScriptHash: computeDstasRequestedScriptHash(sampleATail),
      requestedPkh: cat.Address.Hash160,
      rateNumerator: 1,
      rateDenominator: 1,
    });
    const ctx = createSwapContext({
      satoshisA: 100,
      satoshisB: 100,
      actionDataA,
      actionDataB,
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
          confiscatable: ctx.schemeB.Confiscation,
          authorityServiceField: hash160(ctx.bob.PublicKey),
          confiscationAuthorityServiceField: hash160(ctx.bob.PublicKey),
          actionData: null,
        }),
        swapDestination({
          satoshis: 100,
          owner: ctx.cat.Address.Hash160,
          tokenIdHex: ctx.schemeA.TokenId,
          freezable: ctx.schemeA.Freeze,
          confiscatable: ctx.schemeA.Confiscation,
          authorityServiceField: hash160(ctx.cat.PublicKey),
          confiscationAuthorityServiceField: hash160(ctx.cat.PublicKey),
          actionData: null,
        }),
        swapDestination({
          satoshis: 50,
          owner: ctx.cat.Address.Hash160,
          tokenIdHex: ctx.schemeB.TokenId,
          freezable: ctx.schemeB.Freeze,
          confiscatable: ctx.schemeB.Confiscation,
          authorityServiceField: hash160(ctx.bob.PublicKey),
          confiscationAuthorityServiceField: hash160(ctx.bob.PublicKey),
          actionData: actionDataB,
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
        freezeAuthority: { m: 1, publicKeys: [toHex(bob.PublicKey)] },
        confiscationAuthority: { m: 1, publicKeys: [toHex(bob.PublicKey)] },
      },
    );
    const sampleBTail = buildDstasLockingScriptForOwnerField({
      ownerField: cat.Address.Hash160,
      tokenIdHex: schemeB.TokenId,
      freezable: schemeB.Freeze,
      confiscatable: schemeB.Confiscation,
      authorityServiceField: hash160(bob.PublicKey),
      confiscationAuthorityServiceField: hash160(bob.PublicKey),
      frozen: false,
    });
    const actionDataA = buildSwapActionData({
      requestedScriptHash: computeDstasRequestedScriptHash(sampleBTail),
      requestedPkh: bob.Address.Hash160,
      rateNumerator: 1,
      rateDenominator: 2,
    });
    const ctx = createSwapContext({
      satoshisA: 100,
      satoshisB: 100,
      actionDataA,
      actionDataB: null,
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
          confiscatable: ctx.schemeB.Confiscation,
          authorityServiceField: hash160(ctx.bob.PublicKey),
          confiscationAuthorityServiceField: hash160(ctx.bob.PublicKey),
          actionData: null,
        }),
        swapDestination({
          satoshis: 80,
          owner: ctx.cat.Address.Hash160,
          tokenIdHex: ctx.schemeA.TokenId,
          freezable: ctx.schemeA.Freeze,
          confiscatable: ctx.schemeA.Confiscation,
          authorityServiceField: hash160(ctx.cat.PublicKey),
          confiscationAuthorityServiceField: hash160(ctx.cat.PublicKey),
          actionData: null,
        }),
        swapDestination({
          satoshis: 20,
          owner: ctx.bob.Address.Hash160,
          tokenIdHex: ctx.schemeA.TokenId,
          freezable: ctx.schemeA.Freeze,
          confiscatable: ctx.schemeA.Confiscation,
          authorityServiceField: hash160(ctx.cat.PublicKey),
          confiscationAuthorityServiceField: hash160(ctx.cat.PublicKey),
          actionData: actionDataA,
        }),
        swapDestination({
          satoshis: 60,
          owner: ctx.cat.Address.Hash160,
          tokenIdHex: ctx.schemeB.TokenId,
          freezable: ctx.schemeB.Freeze,
          confiscatable: ctx.schemeB.Confiscation,
          authorityServiceField: hash160(ctx.bob.PublicKey),
          confiscationAuthorityServiceField: hash160(ctx.bob.PublicKey),
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
        freezeAuthority: { m: 1, publicKeys: [toHex(bob.PublicKey)] },
        confiscationAuthority: { m: 1, publicKeys: [toHex(bob.PublicKey)] },
      },
    );
    const sampleATail = buildDstasLockingScriptForOwnerField({
      ownerField: bob.Address.Hash160,
      tokenIdHex: schemeA.TokenId,
      freezable: schemeA.Freeze,
      confiscatable: schemeA.Confiscation,
      authorityServiceField: hash160(cat.PublicKey),
      confiscationAuthorityServiceField: hash160(cat.PublicKey),
      frozen: false,
    });
    const sampleBTail = buildDstasLockingScriptForOwnerField({
      ownerField: cat.Address.Hash160,
      tokenIdHex: schemeB.TokenId,
      freezable: schemeB.Freeze,
      confiscatable: schemeB.Confiscation,
      authorityServiceField: hash160(bob.PublicKey),
      confiscationAuthorityServiceField: hash160(bob.PublicKey),
      frozen: false,
    });
    const actionDataA = buildSwapActionData({
      requestedScriptHash: computeDstasRequestedScriptHash(sampleBTail),
      requestedPkh: bob.Address.Hash160,
      rateNumerator: 1,
      rateDenominator: 2,
    });
    const actionDataB = buildSwapActionData({
      requestedScriptHash: computeDstasRequestedScriptHash(sampleATail),
      requestedPkh: cat.Address.Hash160,
      rateNumerator: 1,
      rateDenominator: 1,
    });
    const ctx = createSwapContext({
      satoshisA: 100,
      satoshisB: 100,
      actionDataA,
      actionDataB,
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
          confiscatable: ctx.schemeB.Confiscation,
          authorityServiceField: hash160(ctx.bob.PublicKey),
          confiscationAuthorityServiceField: hash160(ctx.bob.PublicKey),
          actionData: null,
        }),
        swapDestination({
          satoshis: 80,
          owner: ctx.cat.Address.Hash160,
          tokenIdHex: ctx.schemeA.TokenId,
          freezable: ctx.schemeA.Freeze,
          confiscatable: ctx.schemeA.Confiscation,
          authorityServiceField: hash160(ctx.cat.PublicKey),
          confiscationAuthorityServiceField: hash160(ctx.cat.PublicKey),
          actionData: null,
        }),
        swapDestination({
          satoshis: 20,
          owner: ctx.bob.Address.Hash160,
          tokenIdHex: ctx.schemeA.TokenId,
          freezable: ctx.schemeA.Freeze,
          confiscatable: ctx.schemeA.Confiscation,
          authorityServiceField: hash160(ctx.cat.PublicKey),
          confiscationAuthorityServiceField: hash160(ctx.cat.PublicKey),
          actionData: actionDataA,
        }),
        swapDestination({
          satoshis: 60,
          owner: ctx.cat.Address.Hash160,
          tokenIdHex: ctx.schemeB.TokenId,
          freezable: ctx.schemeB.Freeze,
          confiscatable: ctx.schemeB.Confiscation,
          authorityServiceField: hash160(ctx.bob.PublicKey),
          confiscationAuthorityServiceField: hash160(ctx.bob.PublicKey),
          actionData: actionDataB,
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
        freezeAuthority: { m: 1, publicKeys: [toHex(bob.PublicKey)] },
        confiscationAuthority: { m: 1, publicKeys: [toHex(bob.PublicKey)] },
      },
    );
    const sampleBTail = buildDstasLockingScriptForOwnerField({
      ownerField: cat.Address.Hash160,
      tokenIdHex: schemeB.TokenId,
      freezable: schemeB.Freeze,
      confiscatable: schemeB.Confiscation,
      authorityServiceField: hash160(bob.PublicKey),
      confiscationAuthorityServiceField: hash160(bob.PublicKey),
      frozen: false,
    });
    const actionDataA = buildSwapActionData({
      requestedScriptHash: computeDstasRequestedScriptHash(sampleBTail),
      requestedPkh: bob.Address.Hash160,
      rateNumerator: 1,
      rateDenominator: 1,
    });
    const ctx = createSwapContext({
      satoshisA: 100,
      satoshisB: 100,
      actionDataA,
      actionDataB: null,
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
          confiscatable: ctx.schemeB.Confiscation,
          authorityServiceField: hash160(ctx.bob.PublicKey),
          confiscationAuthorityServiceField: hash160(ctx.bob.PublicKey),
          actionData: null,
        }),
        swapDestination({
          satoshis: 100,
          owner: ctx.cat.Address.Hash160,
          tokenIdHex: ctx.schemeA.TokenId,
          freezable: ctx.schemeA.Freeze,
          confiscatable: ctx.schemeA.Confiscation,
          authorityServiceField: hash160(ctx.cat.PublicKey),
          confiscationAuthorityServiceField: hash160(ctx.cat.PublicKey),
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
        freezeAuthority: { m: 1, publicKeys: [toHex(bob.PublicKey)] },
        confiscationAuthority: { m: 1, publicKeys: [toHex(bob.PublicKey)] },
      },
    );
    const sampleATail = buildDstasLockingScriptForOwnerField({
      ownerField: bob.Address.Hash160,
      tokenIdHex: schemeA.TokenId,
      freezable: schemeA.Freeze,
      confiscatable: schemeA.Confiscation,
      authorityServiceField: hash160(cat.PublicKey),
      confiscationAuthorityServiceField: hash160(cat.PublicKey),
      frozen: false,
    });
    const sampleBTail = buildDstasLockingScriptForOwnerField({
      ownerField: cat.Address.Hash160,
      tokenIdHex: schemeB.TokenId,
      freezable: schemeB.Freeze,
      confiscatable: schemeB.Confiscation,
      authorityServiceField: hash160(bob.PublicKey),
      confiscationAuthorityServiceField: hash160(bob.PublicKey),
      frozen: false,
    });
    const actionDataA = buildSwapActionData({
      requestedScriptHash: computeDstasRequestedScriptHash(sampleBTail),
      requestedPkh: bob.Address.Hash160,
      rateNumerator: 1,
      rateDenominator: 1,
    });
    const actionDataB = buildSwapActionData({
      requestedScriptHash: computeDstasRequestedScriptHash(sampleATail),
      requestedPkh: cat.Address.Hash160,
      rateNumerator: 1,
      rateDenominator: 1,
    });
    const ctx = createSwapContext({
      satoshisA: 100,
      satoshisB: 100,
      actionDataA,
      actionDataB,
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
          confiscatable: ctx.schemeB.Confiscation,
          authorityServiceField: hash160(ctx.bob.PublicKey),
          confiscationAuthorityServiceField: hash160(ctx.bob.PublicKey),
          actionData: null,
        }),
        swapDestination({
          satoshis: 100,
          owner: ctx.cat.Address.Hash160,
          tokenIdHex: ctx.schemeA.TokenId,
          freezable: ctx.schemeA.Freeze,
          confiscatable: ctx.schemeA.Confiscation,
          authorityServiceField: hash160(ctx.cat.PublicKey),
          confiscationAuthorityServiceField: hash160(ctx.cat.PublicKey),
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
});
