import { mnemonicToSeedSync } from "@scure/bip39";
import { HDKey, Versions } from "@scure/bip32";
import { PrivateKey } from "./private-key";

interface WalletOpt {
  versions: Versions;
  depth?: number;
  index?: number;
  parentFingerprint?: number;
  chainCode: Uint8Array;
  privateKey?: Uint8Array;
}

export class Wallet extends HDKey {
  static fromMnemonic = (mnemonic: string) => {
    let seed: Uint8Array;
    try {
      seed = mnemonicToSeedSync(mnemonic.trim());
    } catch {
      throw new Error("Invalid mnemonic phrase");
    }
    return Wallet.fromHdKey(Wallet.fromMasterSeed(seed));
  };

  static fromHdKey = ({
    versions,
    depth,
    index,
    parentFingerprint,
    chainCode,
    privateKey,
  }: HDKey) =>
    new Wallet({
      versions,
      depth,
      index,
      parentFingerprint,
      chainCode: chainCode!,
      privateKey: privateKey!,
    });

  private _pk: PrivateKey;

  constructor(opt: WalletOpt) {
    super(opt);

    this._pk = new PrivateKey(this.privateKey!);
  }

  get Address() {
    return this._pk.Address;
  }

  get PublicKey() {
    return this._pk.PublicKey;
  }

  deriveWallet = (path: string): Wallet => {
    return Wallet.fromHdKey(super.derive(path));
  };

  sign = (message: Uint8Array) => this._pk.sign(message);
  signMessage = (message: Uint8Array) => this._pk.sign(message);
}
