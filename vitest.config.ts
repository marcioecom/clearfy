import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(process.cwd(), "src") },
  },
  test: {
    environment: "node",
    clearMocks: true,
    passWithNoTests: true,
    exclude: [...configDefaults.exclude, "**/*.integration.test.ts"],
  },
});
