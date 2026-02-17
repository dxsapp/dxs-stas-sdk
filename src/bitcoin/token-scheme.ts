export type TokenAuthority = {
  m: number;
  publicKeys: string[];
};

export type TokenSchemeOptions = {
  freeze?: boolean;
  confiscation?: boolean;
  isDivisible?: boolean;
  authority?: TokenAuthority;
  freezeAuthority?: TokenAuthority;
  confiscationAuthority?: TokenAuthority;
};

export class TokenScheme {
  Name: string;
  TokenId: string;
  Symbol: string;
  SatoshisPerToken: number;
  Freeze: boolean;
  Confiscation: boolean;
  IsDivisible: boolean;
  // Legacy authority field kept for backward compatibility.
  Authority?: TokenAuthority;
  FreezeAuthority?: TokenAuthority;
  ConfiscationAuthority?: TokenAuthority;

  constructor(
    name: string,
    tokenId: string,
    symbol: string,
    satoshisPerToken: number,
    options: TokenSchemeOptions = {},
  ) {
    this.Name = name;
    this.TokenId = tokenId;
    this.Symbol = symbol;
    this.SatoshisPerToken = satoshisPerToken;
    this.Freeze = options.freeze === true;
    this.Confiscation = options.confiscation === true;
    this.IsDivisible = options.isDivisible === true;
    this.Authority = options.authority;
    this.FreezeAuthority = options.freezeAuthority ?? options.authority;
    this.ConfiscationAuthority =
      options.confiscationAuthority ?? options.authority;
  }

  toJson = () =>
    JSON.stringify({
      name: this.Name,
      tokenId: this.TokenId,
      symbol: this.Symbol,
      satoshisPerToken: this.SatoshisPerToken,
      freeze: this.Freeze,
      confiscation: this.Confiscation,
      isDivisible: this.IsDivisible,
      authority: this.Authority,
      freezeAuthority: this.FreezeAuthority,
      confiscationAuthority: this.ConfiscationAuthority,
    });

  toBytes = () => new TextEncoder().encode(this.toJson());
}
