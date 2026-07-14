import { importBusinessData } from "@/business/import";
import { businessImportSchema } from "@/business/import-schema";
import { db, pool } from "@/db/client";
import { readFile } from "node:fs/promises";

async function main() {
  try {
    const path = process.argv[2];
    if (!path) throw new Error("Usage: pnpm business:import -- <json-file>");

    const input = businessImportSchema.parse(
      JSON.parse(await readFile(path, "utf8")),
    );
    console.log(await importBusinessData(db, input));
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
