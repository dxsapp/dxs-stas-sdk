import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import { verify as nobleVerify } from "@noble/secp256k1";
import {
  decomposeStas3LockingScript,
  decomposeStas3UnlockingScript,
  evaluateScripts,
} from "../../src/script";
import { fromHex, toHex } from "../../src/bytes";
import { hash256 } from "../../src/hashes";
import { TransactionReader } from "../../src/transaction/read/transaction-reader";

const parseDerWithSighash = (sigTxFormatHex: string) => {
  const bytes = fromHex(sigTxFormatHex);
  if (bytes.length < 10) throw new Error("signature is too short");

  const sighashType = bytes[bytes.length - 1];
  const der = bytes.subarray(0, bytes.length - 1);
  if (der[0] !== 0x30 || der.length < 8 || der[1] + 2 !== der.length) {
    throw new Error("invalid DER signature");
  }

  let i = 2;
  if (der[i++] !== 0x02) throw new Error("invalid DER R marker");
  const rLen = der[i++];
  const r = der.subarray(i, i + rLen);
  i += rLen;
  if (der[i++] !== 0x02) throw new Error("invalid DER S marker");
  const sLen = der[i++];
  const s = der.subarray(i, i + sLen);

  const to32 = (part: Uint8Array): Uint8Array => {
    const normalized =
      part.length > 0 && part[0] === 0 ? part.subarray(1) : part;
    if (normalized.length > 32) throw new Error("DER integer too long");
    const out = new Uint8Array(32);
    out.set(normalized, 32 - normalized.length);
    return out;
  };

  const compact = new Uint8Array(64);
  compact.set(to32(r), 0);
  compact.set(to32(s), 32);
  return { sighashType, compact };
};

const reverseHex = (hex: string): string => {
  const bytes = fromHex(hex);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[bytes.length - 1 - i];
  return toHex(out);
};

export const dumpTransferDebug = ({
  transferTxHex,
  prevStasLockingScript,
  prevStasSatoshis,
  prevFeeLockingScript,
  prevFeeSatoshis,
  outPath,
}: {
  transferTxHex: string;
  prevStasLockingScript: Uint8Array;
  prevStasSatoshis: number;
  prevFeeLockingScript: Uint8Array;
  prevFeeSatoshis: number;
  outPath: string;
}) => {
  mkdirSync(dirname(outPath), { recursive: true });

  const transferTx = TransactionReader.readHex(transferTxHex);
  const transferLockingDecomposition = decomposeStas3LockingScript(
    transferTx.Outputs[0].LockingScript,
  );
  const transferUnlockingDecomposition = decomposeStas3UnlockingScript(
    transferTx.Inputs[0].UnlockingScript,
  );

  const transferInput0Detailed = evaluateScripts(
    transferTx.Inputs[0].UnlockingScript,
    prevStasLockingScript,
    {
      tx: transferTx,
      inputIndex: 0,
      prevOutputs: [
        {
          lockingScript: prevStasLockingScript,
          satoshis: prevStasSatoshis,
        },
        {
          lockingScript: prevFeeLockingScript,
          satoshis: prevFeeSatoshis,
        },
      ],
    },
    { allowOpReturn: true, trace: true, traceLimit: 1200 },
  );

  let sigChecksOut: boolean | null = null;
  let sighashType: number | null = null;
  let fundingTxIdBeHex: string | null = null;
  if (
    transferUnlockingDecomposition.signatureHex &&
    transferUnlockingDecomposition.preimageHex
  ) {
    const sigParts = parseDerWithSighash(
      transferUnlockingDecomposition.signatureHex,
    );
    const preimageHash = hash256(
      fromHex(transferUnlockingDecomposition.preimageHex),
    );
    sigChecksOut = nobleVerify(
      sigParts.compact,
      preimageHash,
      fromHex(transferUnlockingDecomposition.publicKeyHex!),
      { prehash: false, format: "compact" },
    );
    sighashType = sigParts.sighashType;
  }
  if (transferUnlockingDecomposition.fundingTxIdLeHex) {
    fundingTxIdBeHex = reverseHex(
      transferUnlockingDecomposition.fundingTxIdLeHex,
    );
  }

  writeFileSync(
    outPath,
    `${JSON.stringify(
      {
        transferTxHex,
        transferLockingDecomposition,
        transferUnlockingDecomposition,
        transferInput0SigValid: sigChecksOut,
        transferInput0SigSighashType: sighashType,
        transferInput0FundingTxIdBeHex: fundingTxIdBeHex,
        transferInput0Detailed: {
          success: transferInput0Detailed.success,
          error: transferInput0Detailed.error,
          stackDepth: transferInput0Detailed.stack.length,
          stackTopHex:
            transferInput0Detailed.stack.length > 0
              ? toHex(
                  transferInput0Detailed.stack[
                    transferInput0Detailed.stack.length - 1
                  ],
                )
              : null,
          altStackDepth: transferInput0Detailed.altStack.length,
          traceTail: (transferInput0Detailed.trace ?? []).slice(-120),
          equalityTraceTail: (transferInput0Detailed.equalityTrace ?? []).slice(
            -120,
          ),
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
};
