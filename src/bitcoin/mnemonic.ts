import { generateMnemonic, validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

export { wordlist } from "@scure/bip39/wordlists/english.js";

export type TWords = { [idxs: string]: string };

export class Mnemonic {
  constructor(
    public phrase: string,
    public words: TWords,
  ) {}

  public static generate = (): Mnemonic =>
    Mnemonic.fromPhrase(generateMnemonic(wordlist, 128));

  private static sanitize = (value: string): string =>
    value
      .replace(/\r?\n|\r/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

  public static fromWords = (words: TWords): Mnemonic => {
    const orderedWords = Object.entries(words)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([, word]) => word);
    const phrase = Mnemonic.sanitize(orderedWords.join(" "));

    return Mnemonic.fromPhrase(phrase);
  };

  public static fromPhrase = (phrase: string): Mnemonic => {
    const sanitized = Mnemonic.sanitize(phrase);

    const words = sanitized.split(" ").reduce<TWords>((a, v, i) => {
      a[`${i}`] = v;

      return a;
    }, {});

    return new Mnemonic(sanitized, words);
  };

  public static fromRandomText = (text: string): Mnemonic | undefined => {
    const sanitized = Mnemonic.sanitize(text);

    if (!sanitized) return undefined;

    try {
      if (validateMnemonic(sanitized, wordlist))
        return Mnemonic.fromPhrase(sanitized);
    } catch {
      return undefined;
    }
  };
}
