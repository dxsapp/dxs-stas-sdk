import * as root from "../src";

describe("root namespace exports", () => {
  test("exports canonical dstas namespace", () => {
    expect(typeof root.dstas.BuildDstasIssueTxs).toBe("function");
    expect(typeof root.dstas.BuildDstasTransferTx).toBe("function");
    expect(typeof root.dstas.DstasBundleFactory).toBe("function");
  });

  test("exports older stas namespace", () => {
    expect(typeof root.stas.BuildTransferTx).toBe("function");
    expect(typeof root.stas.BuildSplitTx).toBe("function");
    expect(typeof root.stas.StasBundleFactory).toBe("function");
  });

  test("keeps protocol builders off the root top level", () => {
    expect("BuildDstasIssueTxs" in root).toBe(false);
    expect("BuildTransferTx" in root).toBe(false);
  });

  test("keeps shared primitives at the root top level", () => {
    expect(typeof root.PrivateKey).toBe("function");
    expect(typeof root.TransactionBuilder).toBe("function");
    expect(typeof root.LockingScriptReader).toBe("function");
  });
});
