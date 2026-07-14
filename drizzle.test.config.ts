import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error("TEST_DATABASE_URL is required");
const databaseName = new URL(url).pathname.slice(1);
if (!/[-_]test$/.test(databaseName)) {
  throw new Error("TEST_DATABASE_URL database name must end in -test or _test");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
