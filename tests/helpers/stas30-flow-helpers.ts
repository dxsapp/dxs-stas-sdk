import { OutPoint } from "../../src/bitcoin/out-point";
import { TokenScheme } from "../../src/bitcoin/token-scheme";
import { Wallet } from "../../src/bitcoin/wallet";
import { P2pkhBuilder } from "../../src/script/build/p2pkh-builder";
import {
  BuildStas3IssueTxs,
  BuildStas3TransferTx,
} from "../../src/stas30-factory";
import { TransactionReader } from "../../src/transaction/read/transaction-reader";
import { ScriptType } from "../../src/bitcoin/script-type";
import { toHex } from "../../src/bytes";

export const mnemonic =
  "group spy extend supreme monkey judge avocado cancel exit educate modify bubble";

export const realFundingTxId =
  "989c035c9156ff488c81e75761ef7645b226193a55aad0acf67b112d1e44a9a4";
export const realFundingVout = 0;
export const realFundingSatoshis = 1_935;

export type TStas30FlowFixture = {
  bob: Wallet;
  cat: Wallet;
  alice: Wallet;
  sourceFunding: OutPoint;
  scheme: TokenScheme;
  contractTxHex: string;
  issueTxHex: string;
  contractTx: ReturnType<typeof TransactionReader.readHex>;
  issueTx: ReturnType<typeof TransactionReader.readHex>;
  stasOutPoint: OutPoint;
  feeOutPoint: OutPoint;
};

export const createRealFundingOutPoint = (owner: Wallet) =>
  new OutPoint(
    realFundingTxId,
    realFundingVout,
    new P2pkhBuilder(owner.Address).toBytes(),
    realFundingSatoshis,
    owner.Address,
    ScriptType.p2pkh,
  );

export const createDefaultStas30Scheme = (issuer: Wallet, authority: Wallet) =>
  new TokenScheme("STAS30", toHex(issuer.Address.Hash160), "S30", 1, {
    freeze: true,
    confiscation: true,
    isDivisible: true,
    authority: {
      m: 1,
      publicKeys: [toHex(authority.PublicKey)],
    },
  });

export const createRealFundingFlowFixture = (): TStas30FlowFixture => {
  const bob = Wallet.fromMnemonic(mnemonic).deriveWallet("m/44'/236'/0'/0/0");
  const cat = Wallet.fromMnemonic(mnemonic).deriveWallet("m/44'/236'/0'/0/1");
  const alice = Wallet.fromMnemonic(mnemonic).deriveWallet("m/44'/236'/0'/0/2");

  const sourceFunding = createRealFundingOutPoint(bob);
  const scheme = createDefaultStas30Scheme(bob, cat);

  const { contractTxHex, issueTxHex } = BuildStas3IssueTxs({
    fundingPayment: {
      OutPoint: sourceFunding,
      Owner: bob,
    },
    scheme,
    destinations: [
      {
        Satoshis: 100,
        To: alice.Address,
      },
    ],
  });

  const contractTx = TransactionReader.readHex(contractTxHex);
  const issueTx = TransactionReader.readHex(issueTxHex);

  const stasOutPoint = new OutPoint(
    issueTx.Id,
    0,
    issueTx.Outputs[0].LockignScript,
    issueTx.Outputs[0].Satoshis,
    alice.Address,
    ScriptType.p2stas30,
  );

  const feeOutPoint = new OutPoint(
    issueTx.Id,
    1,
    issueTx.Outputs[1].LockignScript,
    issueTx.Outputs[1].Satoshis,
    bob.Address,
    ScriptType.p2pkh,
  );

  return {
    bob,
    cat,
    alice,
    sourceFunding,
    scheme,
    contractTxHex,
    issueTxHex,
    contractTx,
    issueTx,
    stasOutPoint,
    feeOutPoint,
  };
};

export const buildTransferFromFixture = (
  fixture: TStas30FlowFixture,
  omitChangeOutput: boolean,
) =>
  BuildStas3TransferTx({
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
      To: fixture.bob.Address,
    },
    omitChangeOutput,
  });
