import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  initDb,
  listPrograms,
  createProgram,
  updateProgram,
  deleteProgram,
  resetPrograms,
  getSettings,
  saveSettings,
  pool,
} from "./db.js";
import {
  COOKIE_NAME,
  cookieOptions,
  issueToken,
  passwordMatches,
  requireAuth,
  verifyToken,
  throttleLogin,
  clearLoginAttempts,
} from "./auth.js";
import { mergeSettings } from "../shared/defaults.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";
const PORT = process.env.PORT || 3001;

const app = express();
app.use(express.json({ limit: "256kb" }));
app.use(cookieParser());

// Railway sits behind a proxy; without this req.ip is the proxy's address and
// the login throttle would treat every staff member as the same client.
app.set("trust proxy", 1);

// Wraps an async route so a rejected promise becomes a 500 instead of an
// unhandled rejection that takes the process down.
const route = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

/* ---------------------------------------------------------------- auth ---- */

app.get("/api/session", (req, res) => {
  res.json({ authenticated: verifyToken(req.cookies?.[COOKIE_NAME]) });
});

app.post("/api/login", throttleLogin, (req, res) => {
  if (!passwordMatches(req.body?.password)) {
    return res.status(401).json({ error: "Incorrect password." });
  }
  clearLoginAttempts(req);
  res.cookie(COOKIE_NAME, issueToken(), cookieOptions);
  res.json({ authenticated: true });
});

app.post("/api/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: undefined });
  res.json({ authenticated: false });
});

/* ------------------------------------------------------------ programs ---- */
// Everything below requires a session. The password gates the whole tool, not
// just the settings pane, so reads are protected too.

app.get("/api/programs", requireAuth, route(async (_req, res) => {
  res.json(await listPrograms());
}));

app.post("/api/programs", requireAuth, route(async (req, res) => {
  const { id, name, totalCost, downPayment, clockHours, lengthWeeks } = req.body ?? {};
  if (!id || typeof name !== "string") {
    return res.status(400).json({ error: "id and name are required." });
  }
  res.status(201).json(await createProgram({ id, name, totalCost, downPayment, clockHours, lengthWeeks }));
}));

app.patch("/api/programs/:id", requireAuth, route(async (req, res) => {
  const updated = await updateProgram(req.params.id, req.body ?? {});
  if (!updated) return res.status(404).json({ error: "No such program, or no valid fields to update." });
  res.json(updated);
}));

app.delete("/api/programs/:id", requireAuth, route(async (req, res) => {
  const removed = await deleteProgram(req.params.id);
  if (!removed) return res.status(404).json({ error: "No such program." });
  res.status(204).end();
}));

app.post("/api/programs/reset", requireAuth, route(async (_req, res) => {
  res.json(await resetPrograms());
}));

/* ------------------------------------------------------------ settings ---- */

app.get("/api/settings", requireAuth, route(async (_req, res) => {
  res.json(mergeSettings(await getSettings()));
}));

// Whole-blob write. Settings are a singleton that one staff member edits at a
// time, so last-write-wins is honest here — unlike the programs list, which
// gets per-row writes precisely to avoid that.
app.put("/api/settings", requireAuth, route(async (req, res) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    return res.status(400).json({ error: "Expected a settings object." });
  }
  res.json(mergeSettings(await saveSettings(mergeSettings(req.body))));
}));

/* -------------------------------------------------------------- health ---- */

app.get("/api/health", route(async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ ok: true });
}));

/* --------------------------------------------------------- static SPA ---- */

// Keyed on the build actually existing rather than on NODE_ENV, so a deploy
// that forgets the env var serves the app instead of a blank page. In dev,
// dist/ is absent and Vite serves the UI on its own port.
const dist = path.join(__dirname, "..", "dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  // SPA fallback. Express 5 rejects the old "*" route pattern, so this runs as
  // a plain terminal middleware instead.
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(dist, "index.html"));
  });
}

app.use((err, _req, res, _next) => {
  console.error("[error]", err);
  res.status(500).json({ error: "Server error" });
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[server] listening on :${PORT} (${isProduction ? "production" : "development"})`);
    });
  })
  .catch((err) => {
    console.error("[server] failed to initialise database:", err.message);
    process.exit(1);
  });
