import { Mnemonic } from "../src/bitcoin/mnemonic";
import { Wallet } from "../src/bitcoin/wallet";

const validPhrase =
  "group spy extend supreme monkey judge avocado cancel exit educate modify bubble";

describe("mnemonic guards", () => {
  test("fromPhrase normalizes whitespace", () => {
    const phrase = `  ${validPhrase}  `;
    const mnemonic = Mnemonic.fromPhrase(phrase);

    expect(mnemonic.phrase).toBe(validPhrase);
    expect(Object.keys(mnemonic.words)).toHaveLength(12);
  });

  test("fromPhrase keeps backward-compatible behavior for arbitrary text", () => {
    const mnemonic = Mnemonic.fromPhrase("foo bar baz");
    expect(mnemonic.phrase).toBe("foo bar baz");
    expect(Object.keys(mnemonic.words)).toHaveLength(3);
  });

  test("fromWords sorts by numeric key before validation", () => {
    const words = {
      "10": "modify",
      "0": "group",
      "7": "cancel",
      "4": "monkey",
      "5": "judge",
      "8": "exit",
      "3": "supreme",
      "6": "avocado",
      "11": "bubble",
      "1": "spy",
      "2": "extend",
      "9": "educate",
    };

    const mnemonic = Mnemonic.fromWords(words);
    expect(mnemonic.phrase).toBe(validPhrase);
  });

  test("fromRandomText returns undefined on invalid input", () => {
    expect(Mnemonic.fromRandomText("not a mnemonic")).toBeUndefined();
  });

  test("fromRandomText does not throw on malformed content", () => {
    expect(() =>
      Mnemonic.fromRandomText("\u0000\u0001 definitely-not-valid"),
    ).not.toThrow();
    expect(
      Mnemonic.fromRandomText("\u0000\u0001 definitely-not-valid"),
    ).toBeUndefined();
  });

  test("wallet.fromMnemonic trims surrounding whitespace", () => {
    const wallet = Wallet.fromMnemonic(`  ${validPhrase}  `);
    const derived = wallet.deriveWallet("m/44'/236'/0'/0/0");
    expect(derived.Address.Value).toBe("1QK74CFoD65PqX3cnCQE4GK1Mba6iwEDjj");
  });
});
