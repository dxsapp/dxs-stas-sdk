import { OutPoint } from "../../src/bitcoin/out-point";
import { TokenScheme } from "../../src/bitcoin/token-scheme";
import { Wallet } from "../../src/bitcoin/wallet";
import { P2pkhBuilder } from "../../src/script/build/p2pkh-builder";
import {
  BuildDstasFreezeTx,
  BuildDstasIssueTxs,
  BuildDstasTransferTx,
} from "../../src/dstas-factory";
import { TransactionReader } from "../../src/transaction/read/transaction-reader";
import { ScriptType } from "../../src/bitcoin/script-type";
import { toHex } from "../../src/bytes";

export const mnemonic =
  "group spy extend supreme monkey judge avocado cancel exit educate modify bubble";

export const realFundingTxId =
  "989c035c9156ff488c81e75761ef7645b226193a55aad0acf67b112d1e44a9a4";
export const realFundingVout = 0;
export const realFundingSatoshis = 1_935;

export type TDstasFlowFixture = {
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

export const createDefaultDstasScheme = (issuer: Wallet, authority: Wallet) =>
  new TokenScheme("Divisible STAS", toHex(issuer.Address.Hash160), "S30", 1, {
    freeze: true,
    confiscation: true,
    isDivisible: true,
    freezeAuthority: {
      m: 1,
      publicKeys: [toHex(authority.PublicKey)],
    },
    confiscationAuthority: {
      m: 1,
      publicKeys: [toHex(authority.PublicKey)],
    },
  });

export const createRealFundingFlowFixture = (): TDstasFlowFixture => {
  const bob = Wallet.fromMnemonic(mnemonic).deriveWallet("m/44'/236'/0'/0/0");
  const cat = Wallet.fromMnemonic(mnemonic).deriveWallet("m/44'/236'/0'/0/1");
  const alice = Wallet.fromMnemonic(mnemonic).deriveWallet("m/44'/236'/0'/0/2");

  const sourceFunding = createRealFundingOutPoint(bob);
  const scheme = createDefaultDstasScheme(bob, cat);

  const { contractTxHex, issueTxHex } = BuildDstasIssueTxs({
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
    issueTx.Outputs[0].LockingScript,
    issueTx.Outputs[0].Satoshis,
    alice.Address,
    ScriptType.dstas,
  );

  const feeOutPoint = new OutPoint(
    issueTx.Id,
    1,
    issueTx.Outputs[1].LockingScript,
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
  fixture: TDstasFlowFixture,
  omitChangeOutput: boolean,
) =>
  BuildDstasTransferTx({
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

export const buildFreezeFromFixture = (fixture: TDstasFlowFixture) =>
  BuildDstasFreezeTx({
    stasPayments: [
      {
        OutPoint: fixture.stasOutPoint,
        Owner: fixture.cat,
      },
    ],
    feePayment: {
      OutPoint: fixture.feeOutPoint,
      Owner: fixture.bob,
    },
    destinations: [
      {
        Satoshis: fixture.stasOutPoint.Satoshis,
        To: fixture.alice.Address,
        Frozen: true,
      },
    ],
    Scheme: fixture.scheme,
  });
