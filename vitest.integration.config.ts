import "dotenv/config";
import base from "./vitest.config";
import { mergeConfig, defineConfig } from "vitest/config";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("TEST_DATABASE_URL is required");
const databaseName = new URL(testDatabaseUrl).pathname.slice(1);
if (!/[-_]test$/.test(databaseName)) {
  throw new Error("TEST_DATABASE_URL database name must end in -test or _test");
}
process.env.DATABASE_URL = testDatabaseUrl;

export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ["**/*.integration.test.ts"],
      fileParallelism: false,
      globalTeardown: ["./vitest.integration.teardown.ts"],
    },
  }),
);
