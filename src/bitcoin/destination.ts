import { Address } from "./address";
import { Bytes } from "../bytes";

export type TDestination = {
  Address: Address;
  Satoshis: number;
  Data?: Bytes[];
};
