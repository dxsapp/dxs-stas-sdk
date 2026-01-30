import { ScriptType } from "../src/bitcoin/script-type";
import { TransactionBuilder } from "../src/transaction/build/transaction-builder";
import { TransactionReader } from "../src/transaction/read/transaction-reader";
import { bytesToUtf8 } from "../src/bytes";

describe("testing transaction reader", () => {
  test("read open position transaction", () => {
    const hex =
      "010000000142c4ccc0db9a4639748b350f15fff0e674c6e27b4e9f35aa91ef9eedaecadabe020000006a473044022034577ba0f2fbc54ff60d846555c23b74b9ae2721d95f5758453581ecd2a133400220258d4ffa96bf26e6b3563111ec1012dae1c7b7123adfe0fbaeddcdc682e6493341210377efa9937bd4a52edc99f431e2d61f888c173498ded048642343a8133b07c42bffffffff0360090000000000001976a91444800da3829882d058f5938992b16b53e0c3cb5188ac000000000000000039006a076273767465737427756c57592b3834485a623032767a3369533236393044513d3d2c6d3130372c74622c61302e30310474657874014205460000000000001976a914e3b111de8fec527b41f4189e313638075d96ccd688ac00000000";
    const transaction = TransactionReader.readHex(hex);

    expect(transaction.Id).toBe(
      "20cb9b2944f19c9c2e7424fa2d710b7c3adbb2701f1a4c9505f5db94d6af331b"
    );

    expect(transaction.Inputs.length).toBe(1);
    expect(transaction.Inputs[0].TxId).toBe(
      "bedacaaeed9eef91aa359f4e7be2c674e6f0ff150f358b7439469adbc0ccc442"
    );
    expect(transaction.Inputs[0].Vout).toBe(2);
    expect(transaction.Inputs[0].Sequence).toBe(
      TransactionBuilder.DefaultSequence
    );

    expect(transaction.Outputs.length).toBe(3);

    expect(transaction.Outputs[0].ScriptType).toBe(ScriptType.p2pkh);
    expect(transaction.Outputs[0].Satoshis).toBe(2400);
    expect(transaction.Outputs[0].Address?.Value).toBe(
      "17FCMLqkwyQ4aJGmAD9T2aGKq1UhPmyPmt"
    );
    expect(transaction.Outputs[0].data.length).toBe(0);

    expect(transaction.Outputs[1].ScriptType).toBe(ScriptType.nullData);
    expect(transaction.Outputs[1].Satoshis).toBe(0);
    expect(transaction.Outputs[1].data.length).toBe(4);
    expect(bytesToUtf8(transaction.Outputs[1].data[0])).toBe("bsvtest");
    expect(bytesToUtf8(transaction.Outputs[1].data[1])).toBe(
      "ulWY+84HZb02vz3iS2690DQ==,m107,tb,a0.01"
    );
    expect(bytesToUtf8(transaction.Outputs[1].data[2])).toBe("text");
    expect(bytesToUtf8(transaction.Outputs[1].data[3])).toBe("B");

    expect(transaction.Outputs[2].ScriptType).toBe(ScriptType.p2pkh);
    expect(transaction.Outputs[2].Satoshis).toBe(17925);
    expect(transaction.Outputs[2].Address?.Value).toBe(
      "1MkvWa82XHFqmRHaiRZ8BqZS7Uc83wekjp"
    );
    expect(transaction.Outputs[2].data.length).toBe(0);
  });
});
