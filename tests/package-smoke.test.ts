import { execFileSync } from "child_process";
import { basename, dirname, join, resolve } from "path";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const nodeBin = process.execPath;

const packPackage = () => {
  const packDir = mkdtempSync(join(tmpdir(), "dxs-bsv-token-sdk-pack-"));
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
  const consumerDir = mkdtempSync(join(tmpdir(), "dxs-bsv-token-sdk-consumer-"));
  writeFileSync(
    join(consumerDir, "package.json"),
    JSON.stringify(
      { name: "dxs-bsv-token-sdk-consumer-smoke", private: true, version: "1.0.0" },
      null,
      2,
    ),
  );

  execFileSync(
    npmBin,
    [
      "install",
      "--ignore-scripts",
      "--no-package-lock",
      "--no-audit",
      "--no-fund",
      tarballPath,
    ],
    {
      cwd: consumerDir,
      stdio: "pipe",
    },
  );

  return consumerDir;
};

describe("package smoke", () => {
  test("packs only consumer files and resolves root/dstas/stas from a clean install", () => {
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
        'const root = require("dxs-bsv-token-sdk");',
        'const bsv = require("dxs-bsv-token-sdk/bsv");',
        'const dstas = require("dxs-bsv-token-sdk/dstas");',
        'const stas = require("dxs-bsv-token-sdk/stas");',
        'assert.equal(typeof root.BuildDstasIssueTxs, "undefined");',
        'assert.equal(typeof root.BuildTransferTx, "undefined");',
        'assert.equal(typeof root.PrivateKey, "undefined");',
        'assert.equal(typeof root.TransactionBuilder, "undefined");',
        'assert.equal(typeof root.LockingScriptReader, "undefined");',
        'assert.equal(typeof root.bsv.PrivateKey, "function");',
        'assert.equal(typeof root.bsv.TransactionBuilder, "function");',
        'assert.equal(typeof root.bsv.LockingScriptReader, "function");',
        'assert.equal(typeof bsv.PrivateKey, "function");',
        'assert.equal(typeof bsv.TransactionBuilder, "function");',
        'assert.equal(typeof bsv.LockingScriptReader, "function");',
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
        'import * as root from "dxs-bsv-token-sdk";',
        'import * as bsv from "dxs-bsv-token-sdk/bsv";',
        'import * as dstas from "dxs-bsv-token-sdk/dstas";',
        'import * as stas from "dxs-bsv-token-sdk/stas";',
        'assert.equal(typeof root.BuildDstasIssueTxs, "undefined");',
        'assert.equal(typeof root.BuildTransferTx, "undefined");',
        'assert.equal(typeof root.PrivateKey, "undefined");',
        'assert.equal(typeof root.TransactionBuilder, "undefined");',
        'assert.equal(typeof root.LockingScriptReader, "undefined");',
        'assert.equal(typeof root.bsv.PrivateKey, "function");',
        'assert.equal(typeof root.bsv.TransactionBuilder, "function");',
        'assert.equal(typeof root.bsv.LockingScriptReader, "function");',
        'assert.equal(typeof root.dstas.BuildDstasIssueTxs, "function");',
        'assert.equal(typeof root.stas.BuildTransferTx, "function");',
        'assert.equal(typeof bsv.PrivateKey, "function");',
        'assert.equal(typeof bsv.TransactionBuilder, "function");',
        'assert.equal(typeof bsv.LockingScriptReader, "function");',
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
