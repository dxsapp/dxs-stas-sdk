export * as dstas from "./dstas";
export * as stas from "./stas";

// Shared primitives intentionally exposed at the package root.
export { bs58check } from "./base";
export type { Bytes } from "./bytes";
export { bytesToUtf8, concat, equal, fromHex, toHex, utf8ToBytes } from "./bytes";
export { hash160, hash256, ripemd160, sha256 } from "./hashes";
export {
  configureStrictMode,
  getStrictModeConfig,
  resetStrictMode,
  type StrictModeConfig,
  type StrictScriptEvaluationLimits,
} from "./security/strict-mode";

export {
  Address,
  Mnemonic,
  Networks,
  OutPoint,
  OutPointFull,
  PrivateKey,
  ScriptType,
  SignatureHashType,
  TokenScheme,
  Transaction,
  TransactionInput,
  TransactionOutput,
  Wallet,
  type Network,
  type TokenSchemeOptions,
  type TDestination,
  type TPayment,
} from "./bitcoin";

export {
  TransactionBuilder,
  TransactionBuilderError,
  TransactionReader,
} from "./transaction";

export {
  LockingScriptReader,
  NullDataBuilder,
  P2mpkhBuilder,
  P2pkhBuilder,
  P2stasBuilder,
  ScriptBuilder,
  ScriptReadToken,
  ScriptReader,
  SCRIPT_ENABLE_MAGNETIC_OPCODES,
  SCRIPT_ENABLE_MONOLITH_OPCODES,
  SCRIPT_ENABLE_SIGHASH_FORKID,
  asmToBytes,
  asmToTokens,
  buildDstasFlags,
  buildDstasLockingAsm,
  buildDstasLockingScript,
  buildDstasLockingScriptForOwnerField,
  buildDstasLockingTokens,
  buildUnlockingScript,
  computeDstasRequestedScriptHash,
  createPrevOutputResolverFromTransactions,
  decomposeDstasLockingScript,
  decomposeDstasUnlockingScript,
  evaluateScripts,
  evaluateTransactionHex,
  getData,
  getSymbol,
  getTokenId,
  isSplittable,
  type ActionDataInput,
  type DstasActionDataField,
  type DstasFlagsInput,
  type DstasLockingParams,
  type DstasLockingScriptDecomposition,
  type DstasUnlockingScriptDecomposition,
  type PrevOutput,
  type ResolvePrevOutput,
  type ScriptEqualityStep,
  type ScriptEvalContext,
  type ScriptEvalOptions,
  type ScriptEvalResult,
  type ScriptTraceStep,
  type TransactionEvalResult,
  type TransactionInputEvalResult,
} from "./script";
