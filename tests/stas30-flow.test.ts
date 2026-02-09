import { readFileSync } from "fs";
import { ByteReader } from "../src/binary";
import { bs58check } from "../src/base";
import { PrivateKey } from "../src/bitcoin/private-key";
import { evaluateScripts, evaluateTransactionHex } from "../src/script";
import {
  decomposeStas3LockingScript,
  decomposeStas3UnlockingScript,
} from "../src/script";
import { TransactionReader } from "../src/transaction/read/transaction-reader";
import { fromHex, toHex } from "../src/bytes";
import {
  buildTransferFromFixture,
  createRealFundingFlowFixture,
} from "./helpers/stas30-flow-helpers";
import { dumpTransferDebug } from "./debug/stas30-transfer-debug";

const resolveFromTx = (txHex: string) => {
  const tx = TransactionReader.readHex(txHex);
  return (txId: string, vout: number) => {
    if (txId !== tx.Id) return undefined;
    const out = tx.Outputs[vout];
    if (!out) return undefined;
    return { lockingScript: out.LockignScript, satoshis: out.Satoshis };
  };
};

describe("stas30 flow", () => {
  test("reference transfer (P2PKH): stas input validates with preimage-derived prevout", () => {
    const txHex = readFileSync(".temp/Transfer P2PKH TX.txt", "utf8").trim();
    const tx = TransactionReader.readHex(txHex);
    const unlock = decomposeStas3UnlockingScript(tx.Inputs[0].UnlockingScript);
    const lock = decomposeStas3LockingScript(tx.Outputs[0].LockignScript);

    const preimage = fromHex(unlock.preimageHex!);
    const reader = new ByteReader(preimage);
    reader.readUInt32();
    reader.readChunk(32);
    reader.readChunk(32);
    reader.readChunk(32);
    reader.readUInt32();
    const prevScript = reader.readVarChunk();
    const prevSatoshis = reader.readUInt64();

    const dummyFeeLock = Uint8Array.from([
      0x76,
      0xa9,
      0x14,
      ...Array(20).fill(0),
      0x88,
      0xac,
    ]);

    const evalInput0 = evaluateScripts(
      tx.Inputs[0].UnlockingScript,
      prevScript,
      {
        tx,
        inputIndex: 0,
        prevOutputs: [
          { lockingScript: prevScript, satoshis: prevSatoshis },
          { lockingScript: dummyFeeLock, satoshis: 1_000 },
        ],
      },
      { allowOpReturn: true, trace: true, traceLimit: 1_200 },
    );

    const decodedWif = bs58check.decode(
      "cSApidrMXZzYHTTmHRRNjCksbXZ7jhed1zK8Fg28Vg8XNgKcRCpS",
    );
    const signer = new PrivateKey(decodedWif.subarray(1, 33));

    expect(tx.Inputs.length).toBe(2);
    expect(tx.Outputs.length).toBe(1);
    expect(unlock.parsed).toBe(true);
    expect(unlock.spendingType).toBe(1);
    expect(unlock.authPlaceholderOpcodes).toEqual([0, 0, 0]);
    expect(unlock.signatureHex?.slice(-2)).toBe("41");
    expect(lock.flagsHex).toBe("aabb00");
    expect(lock.serviceFieldHexes.length).toBe(0);
    expect(lock.errors.length).toBe(0);
    expect(toHex(signer.PublicKey).toLowerCase()).toBe(
      unlock.publicKeyHex?.toLowerCase(),
    );
    expect(evalInput0.success).toBe(true);
  });

  test("real funding: build contract + issue are valid", () => {
    const fixture = createRealFundingFlowFixture();

    const contractEval = evaluateTransactionHex(
      fixture.contractTxHex,
      (txId, vout) => {
        if (
          txId !== fixture.sourceFunding.TxId ||
          vout !== fixture.sourceFunding.Vout
        ) {
          return undefined;
        }
        return {
          lockingScript: fixture.sourceFunding.LockignScript,
          satoshis: fixture.sourceFunding.Satoshis,
        };
      },
      { allowOpReturn: true },
    );

    const issueEval = evaluateTransactionHex(
      fixture.issueTxHex,
      resolveFromTx(fixture.contractTxHex),
      { allowOpReturn: true },
    );

    expect(fixture.contractTx.Inputs.length).toBe(1);
    expect(fixture.contractTx.Outputs.length).toBe(2);
    expect(fixture.issueTx.Inputs.length).toBe(2);
    expect(fixture.issueTx.Outputs.length).toBe(2);
    expect(contractEval.success).toBe(true);
    expect(issueEval.success).toBe(true);
  });

  test("real funding: transfer no-change flow is valid", () => {
    const fixture = createRealFundingFlowFixture();
    const transferTxHex = buildTransferFromFixture(fixture, true);
    const transferTx = TransactionReader.readHex(transferTxHex);

    const transferEval = evaluateTransactionHex(
      transferTxHex,
      resolveFromTx(fixture.issueTxHex),
      { allowOpReturn: true },
    );

    dumpTransferDebug({
      transferTxHex,
      prevStasLockingScript: fixture.issueTx.Outputs[0].LockignScript,
      prevStasSatoshis: fixture.issueTx.Outputs[0].Satoshis,
      prevFeeLockingScript: fixture.issueTx.Outputs[1].LockignScript,
      prevFeeSatoshis: fixture.issueTx.Outputs[1].Satoshis,
      outPath: ".temp/stas30-transfer-no-change-debug.json",
    });

    expect(transferTx.Inputs.length).toBe(2);
    expect(transferTx.Outputs.length).toBe(1);
    expect(transferTx.Outputs[0].Satoshis).toBe(100);
    expect(transferEval.success).toBe(true);
    expect(transferEval.inputs.find((x) => x.inputIndex === 0)?.success).toBe(
      true,
    );
    expect(transferEval.inputs.find((x) => x.inputIndex === 1)?.success).toBe(
      true,
    );
  });

  test("real funding: transfer with-change flow (current failing case)", () => {
    const fixture = createRealFundingFlowFixture();
    const transferTxHex = buildTransferFromFixture(fixture, false);
    const transferTx = TransactionReader.readHex(transferTxHex);

    const transferEval = evaluateTransactionHex(
      transferTxHex,
      resolveFromTx(fixture.issueTxHex),
      { allowOpReturn: true },
    );

    const unlock = decomposeStas3UnlockingScript(
      transferTx.Inputs[0].UnlockingScript,
    );

    dumpTransferDebug({
      transferTxHex,
      prevStasLockingScript: fixture.issueTx.Outputs[0].LockignScript,
      prevStasSatoshis: fixture.issueTx.Outputs[0].Satoshis,
      prevFeeLockingScript: fixture.issueTx.Outputs[1].LockignScript,
      prevFeeSatoshis: fixture.issueTx.Outputs[1].Satoshis,
      outPath: ".temp/stas30-transfer-with-change-debug.json",
    });

    expect(transferTx.Inputs.length).toBe(2);
    expect(transferTx.Outputs.length).toBe(2);
    expect(unlock.parsed).toBe(true);
    expect(unlock.spendingType).toBe(1);
    expect(transferEval.success).toBe(true);
  });

  test.todo(
    "real funding flow continuation: issue -> transfer -> freeze -> unfreeze -> redeem with on-chain fixtures",
  );
});
