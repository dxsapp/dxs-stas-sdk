import { dstas, stas } from "../src";

describe("root namespace exports", () => {
  test("exports canonical dstas namespace", () => {
    expect(typeof dstas.BuildDstasIssueTxs).toBe("function");
    expect(typeof dstas.BuildDstasTransferTx).toBe("function");
    expect(typeof dstas.DstasBundleFactory).toBe("function");
  });

  test("exports older stas namespace", () => {
    expect(typeof stas.BuildTransferTx).toBe("function");
    expect(typeof stas.BuildSplitTx).toBe("function");
    expect(typeof stas.StasBundleFactory).toBe("function");
  });
});
