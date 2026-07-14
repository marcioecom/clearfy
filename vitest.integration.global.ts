export async function teardown() {
  const { pool } = await import("./src/db/client.js");
  await pool.end();
}
