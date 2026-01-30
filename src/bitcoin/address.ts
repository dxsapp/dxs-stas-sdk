import { bs58check } from "../base";
import { Bytes, fromHex } from "../bytes";
import { hash160 } from "../hashes";
import { Network, Networks } from "./network";

export class Address {
  Value: string;
  Hash160: Bytes;
  Network: Network = Networks.Mainnet;

  /*
  Only p2pkh and mainnet supports now
  */
  constructor(hash160: Bytes) {
    if (hash160.length !== 20) throw new Error("Invalid hash160");

    const buffer = new Uint8Array(21);
    buffer[0] = this.Network.pubKeyHash;
    buffer.set(hash160, 1);

    this.Value = bs58check.encode(buffer);
    this.Hash160 = hash160;
  }

  static fromBase58 = (address: string) => {
    const buffer = bs58check.decode(address);

    if (buffer[0] !== Networks.Mainnet.pubKeyHash)
      throw new Error("Only mainnet supported");

    const hash160 = buffer.subarray(1);

    return new Address(hash160);
  };

  static fromPublicKey = (publicKey: Bytes) => new Address(hash160(publicKey));

  static fromHash160Hex = (hash160: string) =>
    new Address(fromHex(hash160));
}
