import { generateMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";

export { wordlist } from "@scure/bip39/wordlists/english";

export type TWords = { [idxs: string]: string };

export class Mnemonic {
  constructor(public phrase: string, public words: TWords) {}

  public static generate = (): Mnemonic =>
    Mnemonic.fromPhrase(generateMnemonic(wordlist, 128));

  public static fromWords = (words: TWords): Mnemonic => {
    var phrase = Object.values(words).join(" ");

    return new Mnemonic(phrase, words);
  };

  public static fromPhrase = (phrase: string): Mnemonic => {
    var words = phrase.split(" ").reduce<TWords>((a, v, i) => {
      a[`${i}`] = v;

      return a;
    }, {});

    return new Mnemonic(phrase, words);
  };

  public static fromRandomText = (text: string): Mnemonic | undefined => {
    const sanitized = text
      .replace(/\r?\n|\r/g, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/^\s+/, "")
      .replace(/\s+$/, "");

    if (validateMnemonic(sanitized, wordlist))
      return Mnemonic.fromPhrase(sanitized);
  };
}
