import * as root from "../src";

describe("root namespace exports", () => {
  test("exports canonical dstas namespace", () => {
    expect(typeof root.dstas.BuildDstasIssueTxs).toBe("function");
    expect(typeof root.dstas.BuildDstasTransferTx).toBe("function");
    expect(typeof root.dstas.DstasBundleFactory).toBe("function");
  });

  test("exports low-level bsv namespace", () => {
    expect(typeof root.bsv.PrivateKey).toBe("function");
    expect(typeof root.bsv.TransactionBuilder).toBe("function");
    expect(typeof root.bsv.LockingScriptReader).toBe("function");
  });

  test("exports older stas namespace", () => {
    expect(typeof root.stas.BuildTransferTx).toBe("function");
    expect(typeof root.stas.BuildSplitTx).toBe("function");
    expect(typeof root.stas.StasBundleFactory).toBe("function");
  });

  test("keeps protocol builders and primitives off the root top level", () => {
    expect("BuildDstasIssueTxs" in root).toBe(false);
    expect("BuildTransferTx" in root).toBe(false);
    expect("PrivateKey" in root).toBe(false);
    expect("TransactionBuilder" in root).toBe(false);
    expect("LockingScriptReader" in root).toBe(false);
  });
});
