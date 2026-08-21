import { describe, it, expect, beforeAll } from "vitest";
import crypto from "node:crypto";

// auth.js validates its environment at import time, so the env has to be in
// place before the module is pulled in.
let auth;
beforeAll(async () => {
  process.env.STAFF_PASSWORD = "correct-horse-battery";
  process.env.SESSION_SECRET = "test-secret-not-used-anywhere-real";
  process.env.NODE_ENV = "test";
  auth = await import("../server/auth.js");
});

describe("passwordMatches", () => {
  it("accepts the configured password", () => {
    expect(auth.passwordMatches("correct-horse-battery")).toBe(true);
  });

  it("rejects a wrong password, including near misses", () => {
    expect(auth.passwordMatches("correct-horse-batter")).toBe(false);
    expect(auth.passwordMatches("Correct-Horse-Battery")).toBe(false);
    expect(auth.passwordMatches("")).toBe(false);
  });

  it("rejects non-string input rather than throwing", () => {
    expect(auth.passwordMatches(undefined)).toBe(false);
    expect(auth.passwordMatches(null)).toBe(false);
    expect(auth.passwordMatches({})).toBe(false);
  });
});

describe("session tokens", () => {
  it("issues a token that verifies", () => {
    expect(auth.verifyToken(auth.issueToken())).toBe(true);
  });

  it("rejects a token with a tampered expiry", () => {
    // The whole point of signing: pushing the expiry out must invalidate it.
    const token = auth.issueToken();
    const forged = `${Date.now() + 10 ** 12}.${token.split(".")[1]}`;
    expect(auth.verifyToken(forged)).toBe(false);
  });

  it("rejects a token with a tampered signature", () => {
    const [expiresAt] = auth.issueToken().split(".");
    expect(auth.verifyToken(`${expiresAt}.notarealsignature`)).toBe(false);
  });

  it("rejects an already-expired but correctly signed token", () => {
    // Signed with the real secret, so only the expiry check can catch it.
    const past = String(Date.now() - 1000);
    const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(past).digest("base64url");
    expect(auth.verifyToken(`${past}.${sig}`)).toBe(false);
  });

  it("rejects malformed and missing tokens", () => {
    expect(auth.verifyToken(undefined)).toBe(false);
    expect(auth.verifyToken("")).toBe(false);
    expect(auth.verifyToken("nodelimiter")).toBe(false);
    expect(auth.verifyToken(".onlyasignature")).toBe(false);
  });
});

describe("requireAuth", () => {
  const mockRes = () => {
    const res = { statusCode: null, body: null };
    res.status = (code) => ((res.statusCode = code), res);
    res.json = (payload) => ((res.body = payload), res);
    return res;
  };

  it("calls next() with a valid session cookie", () => {
    let called = false;
    const req = { cookies: { [auth.COOKIE_NAME]: auth.issueToken() } };
    auth.requireAuth(req, mockRes(), () => (called = true));
    expect(called).toBe(true);
  });

  it("401s with no cookie at all", () => {
    const res = mockRes();
    let called = false;
    auth.requireAuth({ cookies: {} }, res, () => (called = true));
    expect(called).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  it("401s when the request carries no cookies object", () => {
    const res = mockRes();
    auth.requireAuth({}, res, () => {});
    expect(res.statusCode).toBe(401);
  });
});

describe("throttleLogin", () => {
  const mockRes = () => {
    const res = { statusCode: null, headers: {} };
    res.status = (code) => ((res.statusCode = code), res);
    res.json = () => res;
    res.set = (k, v) => ((res.headers[k] = v), res);
    return res;
  };

  it("blocks after the attempt limit and sets Retry-After", () => {
    const req = { ip: "203.0.113.9" };
    let allowed = 0;
    for (let i = 0; i < 12; i++) {
      const res = mockRes();
      auth.throttleLogin(req, res, () => allowed++);
      if (i === 11) {
        expect(res.statusCode).toBe(429);
        expect(res.headers["Retry-After"]).toBeDefined();
      }
    }
    expect(allowed).toBe(10);
  });

  it("counts each client address separately", () => {
    let allowed = 0;
    auth.throttleLogin({ ip: "198.51.100.1" }, mockRes(), () => allowed++);
    auth.throttleLogin({ ip: "198.51.100.2" }, mockRes(), () => allowed++);
    expect(allowed).toBe(2);
  });

  it("clears a client's attempts after a successful login", () => {
    const req = { ip: "203.0.113.50" };
    for (let i = 0; i < 10; i++) auth.throttleLogin(req, mockRes(), () => {});
    auth.clearLoginAttempts(req);

    let allowed = false;
    auth.throttleLogin(req, mockRes(), () => (allowed = true));
    expect(allowed).toBe(true);
  });
});
