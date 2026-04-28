import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node20",
  shebang: true,
  dts: true,
  clean: true,
  minify: false,
  sourcemap: true,
});