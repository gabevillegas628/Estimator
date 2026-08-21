# Down Payment Estimator

Internal staff tool for a cosmetology school's merged admissions/financial aid
department. Given a student's SAI, program, and dependency status, it estimates
Pell Grant, federal loan eligibility, down payment gap, and a monthly payment
plan for whatever's left.

**Estimate only — not a system of record.**

For the domain reasoning behind the math (why down payment is a charge and not a
credit, the two different proration ratios, award year vs. academic year), read
[HANDOFF.md](HANDOFF.md). That document is the source of truth for *why*; this
one covers *how to run it*.

---

## Layout

```
src/
  App.jsx              Login gate + the estimator UI
  lib/aid-calc.js      Pure aid math — no React, no network. Tested.
  lib/api.js           The only place the client talks to the server
server/
  index.js             Express: API routes, static build, SPA fallback
  db.js                Postgres pool and queries
  migrate.js           Applies pending migrations on boot
  migrations/*.sql     The schema, one numbered file per change
  auth.js              Shared-password gate, signed session cookies
shared/
  defaults.js          Seed programs + settings, used by client AND server
test/                  Vitest regression suite
```

The split that matters is `lib/aid-calc.js`: every function in it is
deterministic on its arguments, which is what makes the regression tests
possible. Two real bugs have already been found in that logic — both now have
named tests. Keep UI and network concerns out of it.

---

## Running locally

You need Node 22+ and a Postgres you can connect to.

```bash
npm install
cp .env.example .env       # then edit it — see below
createdb estimator         # or any database name you point DATABASE_URL at
npm run dev
```

`npm run dev` starts two processes: the API on `:3001` and Vite on `:5173`.
Open **http://localhost:5173** — Vite proxies `/api` to the API process, so the
client's relative paths work the same in dev and production.

Migrations run automatically on boot, and the default programs are seeded on the
run that first creates the schema.

### Changing the schema

Add a numbered file to `server/migrations/` and restart:

```
server/migrations/002_add_whatever.sql
```

The runner applies anything the database has not recorded yet, in filename
order, and writes each one to a `_migrations` table **inside the database**.
That is what makes it safe across restarts and Railway redeploys: the app
container is disposable, the record of what has run is not. A redeploy against
an unchanged schema applies nothing.

Each file runs in a transaction alongside its own ledger insert, so a migration
that fails partway leaves neither the schema change nor the record behind and
simply retries next boot. A Postgres advisory lock serialises the whole thing,
so two containers booting at once during a deploy cannot both apply the same
file.

Migrations are forward-only — there is no `down`. To undo something, write
another migration.

Seed values live in `shared/defaults.js`, not in the migration SQL, so the
defaults and the Reset button in the settings pane cannot drift apart.

### Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | On Railway, reference the Postgres plugin as `${{Postgres.DATABASE_URL}}` |
| `STAFF_PASSWORD` | yes | The shared department password. Minimum 8 characters. |
| `SESSION_SECRET` | in production | Signs session cookies. Without it, sessions reset on every deploy. |
| `PORT` | no | Railway sets this. Defaults to 3001. |
| `NODE_ENV` | in production | Set to `production` so session cookies get the `Secure` flag. |
| `PGSSL` | no | Set to `off` to force-disable TLS for a local Postgres. |

Generate a session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Tests

```bash
npm test           # once
npm run test:watch # while editing
```

`test/aid-calc.test.js` covers the aid math, including explicit regression tests
for the bugs HANDOFF.md documents: the Pell cap on negative SAI, the
tuition-vs-Pell proration ratios, and down payment being a charge rather than a
credit. `test/auth.test.js` covers session signing, password comparison, and the
login throttle.

Neither suite needs a database.

---

## Deploying to Railway

1. Create a Railway project and point it at this repo.
2. Add the **Postgres** plugin to the project.
3. On the app service, set the variables:
   - `DATABASE_URL` → `${{Postgres.DATABASE_URL}}`
   - `STAFF_PASSWORD` → the department password
   - `SESSION_SECRET` → a generated secret (see above)
   - `NODE_ENV` → `production`
4. Deploy. [railway.json](railway.json) already sets the build command, start
   command, and a healthcheck on `/api/health` — a deploy that cannot reach
   Postgres will fail the healthcheck rather than serving a broken app.

In production a single process serves both the API and the built static files,
so there is one service and one port.

---

## Access control

One shared password for the whole department, held in `STAFF_PASSWORD`. There is
no user table and no reset flow — appropriate for a small internal tool, and
enough to keep tuition figures and federal loan limits from being world-editable
on a public URL.

The gate covers the entire tool, not just the settings pane, so no student
numbers are reachable without it. Sessions are stateless: a signed, `httpOnly`
cookie carrying an expiry, valid 30 days. Login attempts are throttled to 10 per
15 minutes per client address.

Changing `STAFF_PASSWORD` or `SESSION_SECRET` invalidates every existing session.

---

## Data model notes

`programs` is a real table with one row per program, written **per row**. That is
deliberate: staff edit programs individually, and writing the whole list as one
blob meant two people editing different programs would clobber each other.
Program-name edits are debounced ~600ms so typing is not one request per
keystroke.

`settings` is a genuine singleton — one row, JSONB, enforced by a
`BOOLEAN PRIMARY KEY CHECK (id)` so a second row is impossible at the schema
level. It is written whole; last-write-wins is honest for a config blob one
person edits at a time.

Every settings read is folded over `DEFAULT_SETTINGS` via `mergeSettings`, so a
row stored before a new field was added still loads.
