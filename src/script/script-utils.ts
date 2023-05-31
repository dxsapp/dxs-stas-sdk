import { OpCode } from "../bitcoin/op-codes";

export const isOpCode = (opCodeNum: number) => {
  if (
    opCodeNum === OpCode.OP_0 ||
    (opCodeNum >= OpCode.OP_PUSHDATA1 && opCodeNum <= OpCode.OP_INVALIDOPCODE)
  ) {
    return { valid: true, opCode: opCodeNum };
  }

  return { valid: false, opCode: OpCode.OP_INVALIDOPCODE };
};
