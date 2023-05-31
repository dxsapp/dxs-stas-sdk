import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";

export default {
  input: `src/index.ts`,
  output: [
    {
      file: "./dist/dxs.stas.sdk.js",
      format: "cjs",
      treeshake: true,
      sourcemap: true,
    },
  ],
  watch: {
    include: "src/**",
  },
  plugins: [
    commonjs(),
    typescript(),
    resolve({
      preferBuiltins: true,
      extensions: [".mjs", ".js", ".json", ".node", ".ts"],
    }),
  ],
};
