import { Address } from "./address";

export type TDestination = {
  Address: Address;
  Satoshis: number;
  Data?: Buffer[];
};
