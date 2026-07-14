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
    include: [...configDefaults.include, "**/*.eval.ts"],
    exclude: [...configDefaults.exclude, "**/*.integration.test.ts"],
  },
});
