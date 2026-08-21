import pg from "pg";
import { DEFAULT_PROGRAMS, DEFAULT_SETTINGS } from "../shared/defaults.js";
import { migrate } from "./migrate.js";

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. On Railway, add the Postgres plugin and reference it as ${{Postgres.DATABASE_URL}}; locally, copy .env.example to .env."
  );
}

// Railway's private network (*.railway.internal) does not use TLS; its public
// proxy host does, with a cert that will not verify against a public CA.
const usesPrivateNetwork = connectionString.includes(".railway.internal");
export const pool = new Pool({
  connectionString,
  ssl: usesPrivateNetwork || process.env.PGSSL === "off" ? false : { rejectUnauthorized: false },
});

// The schema lives in server/migrations/*.sql, applied by migrate(). See that
// file for why programs is a real table and settings is a singleton JSONB row.

// NUMERIC comes back from node-postgres as a string to preserve precision. The
// client does arithmetic on these, so every read converts explicitly here
// rather than overriding the driver's global type parsers.
function rowToProgram(row) {
  return {
    id: row.id,
    name: row.name,
    totalCost: Number(row.total_cost),
    downPayment: Number(row.down_payment),
    clockHours: Number(row.clock_hours),
    lengthWeeks: Number(row.length_weeks),
  };
}

export async function initDb() {
  const applied = await migrate(pool);

  // Seed only on the run that actually created the schema — not merely whenever
  // the table looks empty. That distinction matters: deleting every program is
  // something staff can legitimately do, and defaults resurrecting themselves on
  // the next restart would be a bug. The Reset button exists for putting them
  // back deliberately.
  //
  // Seed values come from shared/defaults.js rather than being written into the
  // migration SQL, so the defaults and the Reset button cannot drift apart.
  if (applied.includes("001_init.sql")) {
    for (const [i, p] of DEFAULT_PROGRAMS.entries()) {
      await createProgram({ ...p, sortOrder: i });
    }
    await pool.query("INSERT INTO settings (id, data) VALUES (TRUE, $1)", [DEFAULT_SETTINGS]);
    console.log(`[db] seeded ${DEFAULT_PROGRAMS.length} default programs and settings`);
  }
}

export async function listPrograms() {
  const { rows } = await pool.query("SELECT * FROM programs ORDER BY sort_order, name");
  return rows.map(rowToProgram);
}

export async function createProgram({ id, name, totalCost, downPayment, clockHours, lengthWeeks, sortOrder }) {
  const { rows } = await pool.query(
    `INSERT INTO programs (id, name, total_cost, down_payment, clock_hours, length_weeks, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6,
             COALESCE($7, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM programs)))
     RETURNING *`,
    [id, name, totalCost ?? 0, downPayment ?? 0, clockHours ?? 0, lengthWeeks ?? 0, sortOrder ?? null]
  );
  return rowToProgram(rows[0]);
}

const FIELD_COLUMNS = {
  name: "name",
  totalCost: "total_cost",
  downPayment: "down_payment",
  clockHours: "clock_hours",
  lengthWeeks: "length_weeks",
};

// Patches only the fields supplied. Column names come from the allowlist above,
// never from request input, so a field name cannot reach the SQL string.
export async function updateProgram(id, fields) {
  const entries = Object.entries(fields).filter(([k]) => k in FIELD_COLUMNS);
  if (entries.length === 0) return null;

  const assignments = entries.map(([k], i) => `${FIELD_COLUMNS[k]} = $${i + 2}`);
  const values = entries.map(([k, v]) => (k === "name" ? String(v) : Number(v) || 0));

  const { rows } = await pool.query(
    `UPDATE programs SET ${assignments.join(", ")}, updated_at = now() WHERE id = $1 RETURNING *`,
    [id, ...values]
  );
  return rows[0] ? rowToProgram(rows[0]) : null;
}

export async function deleteProgram(id) {
  const { rowCount } = await pool.query("DELETE FROM programs WHERE id = $1", [id]);
  return rowCount > 0;
}

export async function resetPrograms() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM programs");
    for (const [i, p] of DEFAULT_PROGRAMS.entries()) {
      await client.query(
        `INSERT INTO programs (id, name, total_cost, down_payment, clock_hours, length_weeks, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [p.id, p.name, p.totalCost, p.downPayment, p.clockHours, p.lengthWeeks, i]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return listPrograms();
}

export async function getSettings() {
  const { rows } = await pool.query("SELECT data FROM settings WHERE id = TRUE");
  return rows[0] ? rows[0].data : DEFAULT_SETTINGS;
}

export async function saveSettings(data) {
  const { rows } = await pool.query(
    `INSERT INTO settings (id, data) VALUES (TRUE, $1)
     ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = now()
     RETURNING data`,
    [data]
  );
  return rows[0].data;
}
