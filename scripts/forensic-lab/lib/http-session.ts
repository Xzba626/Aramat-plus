/**
 * HTTP session helper — real login via Auth.js credentials flow.
 */
const BASE = process.env.CERT_BASE_URL ?? "http://127.0.0.1:3000";

export type HttpSession = {
  cookieHeader: string;
  jarKeys: string[];
};

export async function httpLogin(
  email: string,
  password: string
): Promise<HttpSession> {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  if (!csrfRes.ok) throw new Error(`CSRF ${csrfRes.status}`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const jar = new Map<string, string>();
  const absorb = (headers: Headers) => {
    const list =
      typeof headers.getSetCookie === "function"
        ? headers.getSetCookie()
        : [];
    for (const raw of list) {
      const part = raw.split(";")[0];
      const eq = part.indexOf("=");
      if (eq > 0) jar.set(part.slice(0, eq), part.slice(eq + 1));
    }
  };
  absorb(csrfRes.headers);

  const cookieHeader = () =>
    [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

  const body = new URLSearchParams({
    csrfToken,
    email,
    password,
    callbackUrl: `${BASE}/dashboard`,
    json: "true",
  });

  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader(),
    },
    body,
    redirect: "manual",
  });
  absorb(res.headers);

  const keys = [...jar.keys()];
  if (!keys.some((k) => /session-token|authjs\.session/i.test(k))) {
    throw new Error(`No session cookie after login ${email}: keys=${keys}`);
  }
  return { cookieHeader: cookieHeader(), jarKeys: keys };
}

export async function httpGet(path: string, session: HttpSession) {
  return fetch(`${BASE}${path}`, {
    headers: { Cookie: session.cookieHeader },
  });
}

export async function httpPostJson(
  path: string,
  session: HttpSession,
  payload: unknown
) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Cookie: session.cookieHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function isDevServerUp(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/auth/csrf`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export { BASE };
