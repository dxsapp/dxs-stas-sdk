import { execFileSync } from "child_process";
import { basename } from "path";
import {
  mkdtempSync,
  mkdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { dirname, join, resolve } from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const nodeBin = process.execPath;

const packPackage = () => {
  const packDir = mkdtempSync(join(tmpdir(), "dxs-stas-sdk-pack-"));
  const staleDist = join(repoRoot, "dist", `stale-${randomUUID()}.txt`);
  mkdirSync(join(repoRoot, "dist"), { recursive: true });
  writeFileSync(staleDist, "stale");

  try {
    const raw = execFileSync(
      npmBin,
      ["pack", "--json", "--pack-destination", packDir],
      { cwd: repoRoot, encoding: "utf8" },
    ).trim();
    const packed = JSON.parse(raw) as Array<{
      filename: string;
      files: Array<{ path: string }>;
    }>;
    const [{ filename, files }] = packed;

    return {
      packDir,
      tarballPath: join(packDir, filename),
      files: files.map((file) => file.path),
      staleDist,
    };
  } catch (error) {
    rmSync(packDir, { recursive: true, force: true });
    rmSync(staleDist, { force: true });
    throw error;
  }
};

const prepareConsumer = (tarballPath: string) => {
  const consumerDir = mkdtempSync(join(tmpdir(), "dxs-stas-sdk-consumer-"));
  const nodeModulesDir = join(consumerDir, "node_modules");
  mkdirSync(nodeModulesDir, { recursive: true });

  symlinkSync(
    join(repoRoot, "node_modules", "@noble"),
    join(nodeModulesDir, "@noble"),
    "dir",
  );
  symlinkSync(
    join(repoRoot, "node_modules", "@scure"),
    join(nodeModulesDir, "@scure"),
    "dir",
  );

  execFileSync(
    process.platform === "win32" ? "tar.exe" : "tar",
    ["-xzf", tarballPath, "-C", nodeModulesDir],
    { stdio: "pipe" },
  );
  renameSync(
    join(nodeModulesDir, "package"),
    join(nodeModulesDir, "dxs-stas-sdk"),
  );

  writeFileSync(
    join(consumerDir, "package.json"),
    JSON.stringify(
      { name: "dxs-stas-sdk-consumer-smoke", private: true, version: "1.0.0" },
      null,
      2,
    ),
  );

  return consumerDir;
};

describe("package smoke", () => {
  test("packs only consumer files and resolves root/dstas/stas from the built tarball", () => {
    const { packDir, tarballPath, files, staleDist } = packPackage();
    let consumerDir = "";

    try {
      consumerDir = prepareConsumer(tarballPath);
      expect(files).toContain("package.json");
      expect(files).toContain("README.md");
      expect(
        files.every(
          (file) =>
            file === "package.json" ||
            file === "README.md" ||
            file.startsWith("dist/"),
        ),
      ).toBe(true);
      expect(
        files.some(
          (file) =>
            file.startsWith("src/") ||
            file.startsWith("tests/") ||
            file.startsWith("docs/") ||
            file.startsWith(".github/") ||
            file.startsWith(".husky/"),
        ),
      ).toBe(false);
      expect(
        files.some(
          (file) => file.includes("stas3-") || file.includes("stas30"),
        ),
      ).toBe(false);
      expect(files).not.toContain(`dist/${basename(staleDist)}`);

      const cjsCheck = [
        'const assert = require("node:assert/strict");',
        'const root = require("dxs-stas-sdk");',
        'const dstas = require("dxs-stas-sdk/dstas");',
        'const stas = require("dxs-stas-sdk/stas");',
        'assert.equal(typeof root.dstas.BuildDstasIssueTxs, "function");',
        'assert.equal(typeof root.dstas.DstasBundleFactory, "function");',
        'assert.equal(typeof root.stas.BuildTransferTx, "function");',
        'assert.equal(typeof root.stas.StasBundleFactory, "function");',
        'assert.equal(typeof dstas.BuildDstasTransferTx, "function");',
        'assert.equal(typeof dstas.BuildDstasConfiscateTx, "function");',
        'assert.equal(typeof stas.BuildSplitTx, "function");',
        'assert.equal(typeof stas.BuildRedeemTx, "function");',
      ].join("\n");

      execFileSync(nodeBin, ["-e", cjsCheck], {
        cwd: consumerDir,
        stdio: "pipe",
      });

      const importCheck = [
        'import assert from "node:assert/strict";',
        'import * as root from "dxs-stas-sdk";',
        'import * as dstas from "dxs-stas-sdk/dstas";',
        'import * as stas from "dxs-stas-sdk/stas";',
        'assert.equal(typeof root.dstas.BuildDstasIssueTxs, "function");',
        'assert.equal(typeof root.stas.BuildTransferTx, "function");',
        'assert.equal(typeof dstas.BuildDstasTransferTx, "function");',
        'assert.equal(typeof dstas.BuildDstasConfiscateTx, "function");',
        'assert.equal(typeof stas.BuildTransferTx, "function");',
        'assert.equal(typeof stas.BuildRedeemTx, "function");',
      ].join("\n");

      execFileSync(nodeBin, ["--input-type=module", "-e", importCheck], {
        cwd: consumerDir,
        stdio: "pipe",
      });
    } finally {
      rmSync(packDir, { recursive: true, force: true });
      if (consumerDir) {
        rmSync(consumerDir, { recursive: true, force: true });
      }
      rmSync(staleDist, { force: true });
    }
  });
});
