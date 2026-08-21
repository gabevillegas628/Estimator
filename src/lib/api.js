// The single place the client talks to the server. Everything that used to be
// a window.storage call in the Claude.ai artifact lives behind this module, so
// the component never touches fetch directly.

export class AuthError extends Error {
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "AuthError";
  }
}

async function request(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  // Callers distinguish this from a generic failure so an expired session can
  // drop the user back to the password screen instead of showing an error.
  if (res.status === 401) throw new AuthError();

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    throw new Error(detail?.error || `Request failed (${res.status})`);
  }

  return res.status === 204 ? null : res.json();
}

export const api = {
  getSession: () => request("/api/session"),
  login: (password) => request("/api/login", { method: "POST", body: { password } }),
  logout: () => request("/api/logout", { method: "POST" }),

  getPrograms: () => request("/api/programs"),
  createProgram: (program) => request("/api/programs", { method: "POST", body: program }),
  updateProgram: (id, fields) => request(`/api/programs/${encodeURIComponent(id)}`, { method: "PATCH", body: fields }),
  deleteProgram: (id) => request(`/api/programs/${encodeURIComponent(id)}`, { method: "DELETE" }),
  resetPrograms: () => request("/api/programs/reset", { method: "POST" }),

  getSettings: () => request("/api/settings"),
  saveSettings: (settings) => request("/api/settings", { method: "PUT", body: settings }),
};
