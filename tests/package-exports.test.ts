import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));

describe("package exports", () => {
  test("declares dstas and stas subpath exports", () => {
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
