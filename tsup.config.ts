import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/http/server.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  splitting: false,
  dts: false,
  outExtension: () => ({ js: ".mjs" }),
});
