import "dotenv/config";
import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required");
const databaseName = new URL(testDatabaseUrl).pathname.slice(1);
if (!/[-_]test$/.test(databaseName)) {
  throw new Error("TEST_DATABASE_URL database name must end in -test or _test");
}
process.env.DATABASE_URL = testDatabaseUrl;

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(process.cwd(), "src") },
  },
  test: {
    environment: "node",
    clearMocks: true,
    passWithNoTests: false,
    globalSetup: ["./vitest.integration.global.ts"],
    include: ["**/*.integration.test.ts"],
    exclude: configDefaults.exclude,
    fileParallelism: false,
  },
});
