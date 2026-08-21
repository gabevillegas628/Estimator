import crypto from "node:crypto";

// Shared-password gate. One password for the whole department, no user table
// and no reset flow — appropriate for a small internal tool, and enough to keep
// the school's tuition figures and federal loan limits from being world-editable
// on a public Railway URL.

export const COOKIE_NAME = "dpe_session";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const isProduction = process.env.NODE_ENV === "production";

const STAFF_PASSWORD = process.env.STAFF_PASSWORD;
if (!STAFF_PASSWORD) {
  throw new Error("STAFF_PASSWORD is not set. Set it in Railway's service variables, or in .env locally.");
}
if (STAFF_PASSWORD.length < 8) {
  throw new Error("STAFF_PASSWORD must be at least 8 characters.");
}

// A generated secret means sessions do not survive a restart. Fine in dev,
// silently logs everyone out on every deploy in production — so require it there.
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (isProduction) {
    throw new Error(
      "SESSION_SECRET is not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  sessionSecret = crypto.randomBytes(32).toString("hex");
  console.warn("[auth] SESSION_SECRET not set; using an ephemeral one. Logins will not survive a restart.");
}

function sign(payload) {
  return crypto.createHmac("sha256", sessionSecret).update(payload).digest("base64url");
}

// Stateless token: an expiry plus its HMAC. No session store to keep in sync,
// and nothing to clean up — an expired token simply stops verifying.
export function issueToken() {
  const expiresAt = String(Date.now() + MAX_AGE_MS);
  return `${expiresAt}.${sign(expiresAt)}`;
}

function safeEqual(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyToken(token) {
  if (typeof token !== "string") return false;
  const split = token.lastIndexOf(".");
  if (split < 1) return false;

  const expiresAt = token.slice(0, split);
  const signature = token.slice(split + 1);
  if (!safeEqual(signature, sign(expiresAt))) return false;

  return Number(expiresAt) > Date.now();
}

// Both sides are hashed to a fixed 32 bytes first, so a length mismatch cannot
// throw and the comparison stays constant-time regardless of input length.
export function passwordMatches(input) {
  if (typeof input !== "string" || input.length === 0) return false;
  const given = crypto.createHash("sha256").update(input).digest();
  const expected = crypto.createHash("sha256").update(STAFF_PASSWORD).digest();
  return crypto.timingSafeEqual(given, expected);
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: isProduction, // Railway terminates TLS, so this is safe in production
  maxAge: MAX_AGE_MS,
  path: "/",
};

export function requireAuth(req, res, next) {
  if (verifyToken(req.cookies?.[COOKIE_NAME])) return next();
  res.status(401).json({ error: "Not authenticated" });
}

// Small in-memory throttle on the login route. A shared password is guessable
// by definition, so unbounded attempts against a public URL are the real risk.
// Per-process state is enough here — this runs as a single Railway instance.
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export function throttleLogin(req, res, next) {
  const key = req.ip || "unknown";
  const now = Date.now();
  const record = attempts.get(key);

  if (!record || now > record.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }
  if (record.count >= MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    res.set("Retry-After", String(retryAfter));
    return res.status(429).json({ error: `Too many attempts. Try again in ${Math.ceil(retryAfter / 60)} minutes.` });
  }
  record.count += 1;
  next();
}

export function clearLoginAttempts(req) {
  attempts.delete(req.ip || "unknown");
}
