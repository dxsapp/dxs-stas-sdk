import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const npmCommand = process.env.npm_command ?? "";
if (
  npmCommand === "pack" ||
  npmCommand === "publish" ||
  process.env.CI === "true"
) {
  process.exit(0);
}

const huskyBin =
  process.platform === "win32"
    ? join("node_modules", ".bin", "husky.cmd")
    : join("node_modules", ".bin", "husky");

if (!existsSync(huskyBin)) {
  process.exit(0);
}

const result = spawnSync(huskyBin, ["install"], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
