import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

export const pool = new Pool({ connectionString: databaseUrl });
pool.on("error", (error) => console.error("Idle PostgreSQL client error", error));

export const db = drizzle({ client: pool, schema });
export type Database = typeof db;
