import { TransactionReader } from "../../src/transaction/read/transaction-reader";

export type TPrevOutputResolver = (
  txId: string,
  vout: number,
) => { lockingScript: Uint8Array; satoshis: number } | undefined;

export const assertFeeInRange = (
  txHex: string,
  resolvePrevOutput: TPrevOutputResolver,
  feeRate: number,
  maxSignatureCountForDerVariance: number,
) => {
  const tx = TransactionReader.readHex(txHex);
  const txSizeBytes = txHex.length / 2;

  const totalInput = tx.Inputs.reduce((sum, input) => {
    const prev = resolvePrevOutput(input.TxId, input.Vout);
    if (!prev) {
      throw new Error(`Missing prevout for fee check: ${input.TxId}:${input.Vout}`);
    }
    return sum + prev.satoshis;
  }, 0);

  const totalOutput = tx.Outputs.reduce((sum, out) => sum + out.Satoshis, 0);
  const paidFee = totalInput - totalOutput;
  const minRequiredFee = Math.ceil(txSizeBytes * feeRate);

  // DER signature body can vary by up to 2 bytes per signature.
  const maxExtraBytes = maxSignatureCountForDerVariance * 2;
  const maxExtraFee = Math.ceil(maxExtraBytes * feeRate);
  const maxAllowedFee = minRequiredFee + maxExtraFee;

  expect(paidFee).toBeGreaterThanOrEqual(minRequiredFee);
  expect(paidFee).toBeLessThanOrEqual(maxAllowedFee);
};
