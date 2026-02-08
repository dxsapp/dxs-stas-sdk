import { Bytes } from "../../bytes";
import { ScriptType } from "../../bitcoin/script-type";
import { LockingScriptReader } from "./locking-script-reader";

export const getTokenId = (reader: LockingScriptReader): string | null =>
  reader.getTokenId();

export const getSymbol = (reader: LockingScriptReader): string | null =>
  reader.getSymbol();

export const getData = (reader: LockingScriptReader): Bytes => reader.getData();

export const isSplittable = (reader: LockingScriptReader): boolean => {
  if (reader.ScriptType !== ScriptType.p2stas) return true;
  if (!reader.Data || reader.Data.length < 2) return true;

  const marker = reader.Data[1];
  if (!marker || marker.length !== 1) return true;

  return marker[0] === 0x0;
};

