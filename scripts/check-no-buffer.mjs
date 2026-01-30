import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const roots = ["src", "tests"];
const pattern = /\bBuffer\b/;
const matches = [];

const walk = async (dir) => {
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = join(dir, entry);
    const s = await stat(full);
    if (s.isDirectory()) {
      await walk(full);
      continue;
    }
    if (!/\.(ts|tsx|js|mjs|cjs)$/.test(entry)) continue;
    const content = await readFile(full, "utf8");
    if (pattern.test(content)) {
      matches.push(full);
    }
  }
};

for (const root of roots) {
  await walk(root);
}

if (matches.length > 0) {
  console.error("Buffer usage detected in:");
  for (const file of matches) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

console.log("No Buffer usage detected in src/ or tests/");
