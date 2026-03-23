import {
  Address,
  OutPoint,
  ScriptType,
  TokenScheme,
  Wallet,
} from "../../src/bitcoin";
import { P2pkhBuilder } from "../../src/script/build/p2pkh-builder";
import { hash160 } from "../../src/hashes";
import { toHex } from "../../src/bytes";
import {
  TMasterActor,
  TMasterActorId,
  TMasterAssetId,
  TMasterWorld,
} from "./dstas-master-types";

const mnemonic =
  "group spy extend supreme monkey judge avocado cancel exit educate modify bubble";

const deriveWallet = (index: number) =>
  Wallet.fromMnemonic(mnemonic).deriveWallet(`m/44'/236'/0'/0/${index}`);

const buildMlpkhPreimage = (m: number, wallets: Wallet[]): Uint8Array => {
  const n = wallets.length;
  const result = new Uint8Array(1 + n * (1 + 33) + 1);
  let offset = 0;
  result[offset++] = m & 0xff;
  for (const wallet of wallets) {
    result[offset++] = 0x21;
    result.set(wallet.PublicKey, offset);
    offset += wallet.PublicKey.length;
  }
  result[offset] = n & 0xff;
  return result;
};

const createSyntheticFundingOutPoint = (
  txIdByte: string,
  owner: Wallet,
  satoshis: number,
) =>
  new OutPoint(
    txIdByte.repeat(64),
    0,
    new P2pkhBuilder(owner.Address).toBytes(),
    satoshis,
    owner.Address,
    ScriptType.p2pkh,
  );

const createActors = (): Record<TMasterActorId, TMasterActor> => {
  const issuerA = deriveWallet(0);
  const issuerB = deriveWallet(1);
  const issuerC = deriveWallet(2);
  const ownerA = deriveWallet(3);
  const ownerB = deriveWallet(4);
  const ownerC = deriveWallet(5);
  const ownerD = deriveWallet(6);
  const ownerE = deriveWallet(7);
  const freezeAuth = deriveWallet(8);
  const confiscationAuth = deriveWallet(9);
  const msAuth1 = deriveWallet(10);
  const msAuth2 = deriveWallet(11);
  const msAuth3 = deriveWallet(12);
  const msOwnerWallets = [
    deriveWallet(13),
    deriveWallet(14),
    deriveWallet(15),
    deriveWallet(16),
    deriveWallet(17),
  ];
  const feeWallet = deriveWallet(18);

  const actors: Record<TMasterActorId, TMasterActor> = {
    issuerA: {
      id: "issuerA",
      kind: "single",
      wallet: issuerA,
      address: issuerA.Address,
    },
    issuerB: {
      id: "issuerB",
      kind: "single",
      wallet: issuerB,
      address: issuerB.Address,
    },
    issuerC: {
      id: "issuerC",
      kind: "single",
      wallet: issuerC,
      address: issuerC.Address,
    },
    ownerA: {
      id: "ownerA",
      kind: "single",
      wallet: ownerA,
      address: ownerA.Address,
    },
    ownerB: {
      id: "ownerB",
      kind: "single",
      wallet: ownerB,
      address: ownerB.Address,
    },
    ownerC: {
      id: "ownerC",
      kind: "single",
      wallet: ownerC,
      address: ownerC.Address,
    },
    ownerD: {
      id: "ownerD",
      kind: "single",
      wallet: ownerD,
      address: ownerD.Address,
    },
    ownerE: {
      id: "ownerE",
      kind: "single",
      wallet: ownerE,
      address: ownerE.Address,
    },
    freezeAuth: {
      id: "freezeAuth",
      kind: "single",
      wallet: freezeAuth,
      address: freezeAuth.Address,
    },
    confiscationAuth: {
      id: "confiscationAuth",
      kind: "single",
      wallet: confiscationAuth,
      address: confiscationAuth.Address,
    },
    msFreezeAuth: {
      id: "msFreezeAuth",
      kind: "multisig",
      m: 2,
      wallets: [msAuth1, msAuth2, msAuth3],
      publicKeysHex: [
        toHex(msAuth1.PublicKey),
        toHex(msAuth2.PublicKey),
        toHex(msAuth3.PublicKey),
      ],
      address: new Address(
        hash160(buildMlpkhPreimage(2, [msAuth1, msAuth2, msAuth3])),
      ),
    },
    msOwner: {
      id: "msOwner",
      kind: "multisig",
      m: 3,
      wallets: msOwnerWallets,
      publicKeysHex: msOwnerWallets.map((wallet) => toHex(wallet.PublicKey)),
      address: new Address(hash160(buildMlpkhPreimage(3, msOwnerWallets))),
    },
    feeWallet: {
      id: "feeWallet",
      kind: "single",
      wallet: feeWallet,
      address: feeWallet.Address,
    },
  };

  return actors;
};

const requireSingleActor = (actor: TMasterActor, id: string) => {
  if (actor.kind !== "single") {
    throw new Error(`Actor ${id} must be single-wallet in fixture setup`);
  }
  return actor;
};

const requireMultisigActor = (actor: TMasterActor, id: string) => {
  if (actor.kind !== "multisig") {
    throw new Error(`Actor ${id} must be multisig in fixture setup`);
  }
  return actor;
};

const createSchemes = (actors: Record<TMasterActorId, TMasterActor>) => ({
  assetA: new TokenScheme(
    "Divisible STAS A",
    toHex(requireSingleActor(actors.issuerA, "issuerA").address.Hash160),
    "DSTA",
    1,
    {
      freeze: true,
      confiscation: true,
      isDivisible: true,
      freezeAuthority: {
        m: 1,
        publicKeys: [
          toHex(
            requireSingleActor(actors.freezeAuth, "freezeAuth").wallet
              .PublicKey,
          ),
        ],
      },
      confiscationAuthority: {
        m: 1,
        publicKeys: [
          toHex(
            requireSingleActor(actors.confiscationAuth, "confiscationAuth")
              .wallet.PublicKey,
          ),
        ],
      },
    },
  ),
  assetB: new TokenScheme(
    "Divisible STAS B",
    toHex(requireSingleActor(actors.issuerB, "issuerB").address.Hash160),
    "DSTB",
    1,
    {
      freeze: true,
      confiscation: true,
      isDivisible: true,
      freezeAuthority: {
        m: 1,
        publicKeys: [
          toHex(
            requireSingleActor(actors.freezeAuth, "freezeAuth").wallet
              .PublicKey,
          ),
        ],
      },
      confiscationAuthority: {
        m: 1,
        publicKeys: [
          toHex(
            requireSingleActor(actors.confiscationAuth, "confiscationAuth")
              .wallet.PublicKey,
          ),
        ],
      },
    },
  ),
  assetC: new TokenScheme(
    "Divisible STAS C",
    toHex(requireSingleActor(actors.issuerC, "issuerC").address.Hash160),
    "DSTC",
    1,
    {
      freeze: true,
      confiscation: true,
      isDivisible: true,
      freezeAuthority: {
        m: requireMultisigActor(actors.msFreezeAuth, "msFreezeAuth").m,
        publicKeys: requireMultisigActor(actors.msFreezeAuth, "msFreezeAuth")
          .publicKeysHex,
      },
      confiscationAuthority: {
        m: requireMultisigActor(actors.msFreezeAuth, "msFreezeAuth").m,
        publicKeys: requireMultisigActor(actors.msFreezeAuth, "msFreezeAuth")
          .publicKeysHex,
      },
    },
  ),
});

export const createMasterWorld = (): TMasterWorld => {
  const actors = createActors();
  const schemes = createSchemes(actors);
  const syntheticFunding = {
    assetA: {
      outPoint: createSyntheticFundingOutPoint(
        "1",
        requireSingleActor(actors.issuerA, "issuerA").wallet,
        100_000,
      ),
      owner: requireSingleActor(actors.issuerA, "issuerA").wallet,
    },
    assetB: {
      outPoint: createSyntheticFundingOutPoint(
        "2",
        requireSingleActor(actors.issuerB, "issuerB").wallet,
        100_000,
      ),
      owner: requireSingleActor(actors.issuerB, "issuerB").wallet,
    },
    assetC: {
      outPoint: createSyntheticFundingOutPoint(
        "3",
        requireSingleActor(actors.issuerC, "issuerC").wallet,
        100_000,
      ),
      owner: requireSingleActor(actors.issuerC, "issuerC").wallet,
    },
  } satisfies Record<TMasterAssetId, { outPoint: OutPoint; owner: Wallet }>;

  const world: TMasterWorld = {
    actors,
    schemes,
    syntheticFunding,
    txMap: new Map(),
    history: [],
    liveOutputs: new Map(),
    feeOutputs: {},
    checkpoints: new Map(),
  };

  return world;
};
