import { env } from "@/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export const pool = new Pool({ connectionString: env.DATABASE_URL });
pool.on("error", (error) => console.error("Idle PostgreSQL client error", error));

export const db = drizzle({ client: pool, schema });
export type Database = typeof db;
