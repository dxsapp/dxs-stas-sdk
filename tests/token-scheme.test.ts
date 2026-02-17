import { TokenScheme } from "../src/bitcoin/token-scheme";

describe("token scheme", () => {
  test("keeps backward-compatible defaults", () => {
    const scheme = new TokenScheme("Base", "aa".repeat(32), "B", 1);
    const json = JSON.parse(scheme.toJson());

    expect(json.name).toBe("Base");
    expect(json.freeze).toBe(false);
    expect(json.confiscation).toBe(false);
    expect(json.isDivisible).toBe(false);
    expect(json.freezeAuthority).toBeUndefined();
    expect(json.confiscationAuthority).toBeUndefined();
  });

  test("serializes freeze/confiscation/divisible and authorities", () => {
    const scheme = new TokenScheme("Dstas", "bb".repeat(32), "S30", 1, {
      freeze: true,
      confiscation: true,
      isDivisible: true,
      freezeAuthority: {
        m: 2,
        publicKeys: ["02".repeat(33), "03".repeat(33), "04".repeat(33)],
      },
      confiscationAuthority: {
        m: 2,
        publicKeys: ["02".repeat(33), "03".repeat(33), "04".repeat(33)],
      },
    });

    const json = JSON.parse(scheme.toJson());

    expect(json.freeze).toBe(true);
    expect(json.confiscation).toBe(true);
    expect(json.isDivisible).toBe(true);
    expect(json.freezeAuthority.m).toBe(2);
    expect(json.freezeAuthority.publicKeys.length).toBe(3);
    expect(json.confiscationAuthority.m).toBe(2);
    expect(json.confiscationAuthority.publicKeys.length).toBe(3);
  });

  test("supports separate freeze/confiscation authorities", () => {
    const scheme = new TokenScheme("Dstas", "cc".repeat(32), "S30", 1, {
      freeze: true,
      confiscation: true,
      freezeAuthority: {
        m: 2,
        publicKeys: ["02".repeat(33), "03".repeat(33), "04".repeat(33)],
      },
      confiscationAuthority: {
        m: 1,
        publicKeys: ["05".repeat(33)],
      },
    });

    const json = JSON.parse(scheme.toJson());

    expect(json.freezeAuthority.m).toBe(2);
    expect(json.freezeAuthority.publicKeys.length).toBe(3);
    expect(json.confiscationAuthority.m).toBe(1);
    expect(json.confiscationAuthority.publicKeys.length).toBe(1);
  });
});
