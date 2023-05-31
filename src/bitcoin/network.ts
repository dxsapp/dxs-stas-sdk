export type Network = {
  pubKeyHash: number;
  wif: number;
};

export const Networks: { [name: string]: Network } = {
  Mainnet: {
    pubKeyHash: 0x00,
    wif: 0x80,
  },
};
