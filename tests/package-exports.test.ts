import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

describe("package exports", () => {
  test("declares only root plus protocol subpath exports", () => {
    expect(Object.keys(pkg.exports)).toEqual([
      ".",
      "./bsv",
      "./dstas",
      "./stas",
      "./package.json",
    ]);
    expect(pkg.exports["."]).toEqual({
      types: "./dist/index.d.ts",
      import: "./dist/index.js",
      require: "./dist/index.js",
      default: "./dist/index.js",
    });
    expect(pkg.exports["./bsv"]).toEqual({
      types: "./dist/bsv.d.ts",
      import: "./dist/bsv.js",
      require: "./dist/bsv.js",
      default: "./dist/bsv.js",
    });
    expect(pkg.exports["./dstas"]).toEqual({
      types: "./dist/dstas.d.ts",
      import: "./dist/dstas.js",
      require: "./dist/dstas.js",
      default: "./dist/dstas.js",
    });
    expect(pkg.exports["./stas"]).toEqual({
      types: "./dist/stas.d.ts",
      import: "./dist/stas.js",
      require: "./dist/stas.js",
      default: "./dist/stas.js",
    });
  });
});
