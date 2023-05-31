import { bs58check } from "../base";
import { toBuffer } from "../buffer/buffer-utils";
import { hash160 } from "../hashes";
import { Network, Networks } from "./network";

export class Address {
  Value: string;
  Hash160: Buffer;
  Network: Network = Networks.Mainnet;

  /*
  Only p2pkh and mainnet supports now
  */
  constructor(hash160: Buffer) {
    if (hash160.length !== 20) throw new Error("Invalid hash160");

    const buffer = Buffer.allocUnsafe(21);

    buffer.writeUInt8(this.Network.pubKeyHash, 0);
    hash160.copy(buffer, 1);

    this.Value = bs58check.encode(buffer);
    this.Hash160 = hash160;
  }

  static fromBase58 = (address: string) => {
    const buffer = toBuffer(bs58check.decode(address));

    if (buffer[0] !== Networks.Mainnet.pubKeyHash)
      throw new Error("Only mainnet supported");

    const hash160 = Buffer.allocUnsafe(20);
    buffer.copy(hash160, 0, 1);

    return new Address(hash160);
  };

  static fromPublicKey = (publicKey: Buffer) => new Address(hash160(publicKey));

  static fromHash160Hex = (hash160: string) =>
    new Address(Buffer.from(hash160, "hex"));
}
