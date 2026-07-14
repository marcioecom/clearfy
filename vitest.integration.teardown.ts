export default async function teardown() {
  const { pool } = await import("./src/db/client");
  await pool.end();
}
