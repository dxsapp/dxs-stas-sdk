import { rmSync } from "fs";
import { resolve } from "path";

rmSync(resolve("dist"), { recursive: true, force: true });
