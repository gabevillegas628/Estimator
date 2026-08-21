-- Initial schema.
--
-- Two tables, deliberately shaped differently:
--
--   programs — a real relational table, one row per program. Staff edit these
--     individually, so per-row writes mean two people editing different
--     programs cannot clobber each other the way writing a whole JSON array
--     would. sort_order preserves the display order the staff set.
--
--   settings — a genuine singleton config blob. The BOOLEAN PRIMARY KEY with a
--     CHECK constraint makes a second row impossible at the schema level. JSONB
--     avoids mirroring a nested JS object (loanLimits especially) across twenty
--     columns that would need a migration every time a field is added.

CREATE TABLE programs (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  total_cost    NUMERIC(12,2) NOT NULL DEFAULT 0,
  down_payment  NUMERIC(12,2) NOT NULL DEFAULT 0,
  clock_hours   INTEGER NOT NULL DEFAULT 0,
  length_weeks  INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE settings (
  id          BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
