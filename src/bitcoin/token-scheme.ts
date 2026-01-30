export class TokenScheme {
  Name: string;
  TokenId: string;
  Symbol: string;
  SatoshisPerToken: number;

  constructor(
    name: string,
    tokenId: string,
    symbol: string,
    satoshisPerToken: number
  ) {
    this.Name = name;
    this.TokenId = tokenId;
    this.Symbol = symbol;
    this.SatoshisPerToken = satoshisPerToken;
  }

  toJson = () =>
    JSON.stringify({
      name: this.Name,
      tokenId: this.TokenId,
      symbol: this.Symbol,
      satoshisPerToken: this.SatoshisPerToken,
    });

  toBytes = () => new TextEncoder().encode(this.toJson());
}
