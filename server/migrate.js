import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

// Fixed, arbitrary key for the advisory lock. Any instance running migrations
// takes it first, so two containers booting at once during a Railway deploy
// cannot both try to apply the same file. The second waits, then finds nothing
// left to do.
const LOCK_KEY = 5417203;

/**
 * Applies any migration files the database has not recorded yet, in filename
 * order, and returns the names of the ones applied this run.
 *
 * The ledger (`_migrations`) lives in the database rather than on disk, which
 * is what makes this safe across restarts and redeploys — the app container is
 * disposable, the record of what has run is not.
 *
 * Each file runs inside a transaction together with its own ledger insert.
 * Postgres has transactional DDL, so a migration that fails halfway leaves
 * neither the schema change nor the record behind, and simply retries on the
 * next boot.
 */
export async function migrate(pool) {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name        TEXT PRIMARY KEY,
        applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query("SELECT name FROM _migrations");
    const alreadyApplied = new Set(rows.map((r) => r.name));

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
    const appliedNow = [];

    for (const file of files) {
      if (alreadyApplied.has(file)) continue;

      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed and was rolled back: ${err.message}`);
      }

      appliedNow.push(file);
      console.log(`[migrate] applied ${file}`);
    }

    if (appliedNow.length === 0) console.log("[migrate] schema up to date");
    return appliedNow;
  } finally {
    // Best-effort unlock; the lock is session-scoped and dies with the
    // connection anyway, so a failure here is not worth masking a real error.
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
    client.release();
  }
}
