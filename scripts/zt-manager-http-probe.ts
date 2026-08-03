const BASE = "http://127.0.0.1:3000";

async function login(email: string, password: string) {
  const jar = new Map<string, string>();
  const absorb = (h: Headers) => {
    for (const raw of h.getSetCookie()) {
      const p = raw.split(";")[0];
      const i = p.indexOf("=");
      if (i > 0) jar.set(p.slice(0, i), p.slice(i + 1));
    }
  };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  absorb(csrfRes.headers);
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie(),
    },
    body: new URLSearchParams({
      csrfToken,
      email,
      password,
      callbackUrl: `${BASE}/dashboard`,
      json: "true",
    }),
    redirect: "manual",
  });
  absorb(res.headers);
  return cookie();
}

async function hit(c: string, path: string, init?: RequestInit) {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Cookie: c,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  return {
    path,
    status: r.status,
    loc: r.headers.get("location"),
  };
}

async function main() {
  const c = await login("manager@aromat.plus", "manager1234");
  const rows: unknown[] = [];
  for (const p of [
    "/api/dashboard",
    "/api/analytics?period=month",
    "/api/journal",
    "/api/stores",
    "/api/expenses",
    "/api/users",
    "/api/revisions",
    "/api/company",
    "/api/packaging-skus",
    "/settings/wipe",
    "/users",
    "/warehouse/write-offs",
    "/journal",
  ]) {
    rows.push(await hit(c, p));
  }
  const list = await (
    await fetch(`${BASE}/api/products`, { headers: { Cookie: c } })
  ).json();
  const id = list?.[0]?.id;
  if (id) {
    rows.push(
      await hit(c, `/api/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: "hack" }),
      })
    );
    rows.push(
      await hit(c, `/api/products/${id}/cost`, {
        method: "POST",
        body: JSON.stringify({ defaultCostPerUnit: 99 }),
      })
    );
  }
  rows.push(await hit(c, "/api/expenses", { method: "POST", body: "{}" }));
  rows.push(await hit(c, "/api/products", { method: "POST", body: "{}" }));
  rows.push(
    await hit(c, "/api/company", {
      method: "PATCH",
      body: JSON.stringify({ name: "X" }),
    })
  );
  const skus = await (
    await fetch(`${BASE}/api/packaging-skus`, { headers: { Cookie: c } })
  ).json();
  if (skus?.[0]?.id) {
    rows.push(
      await hit(c, "/api/packaging-skus", {
        method: "PATCH",
        body: JSON.stringify({ id: skus[0].id, defaultCost: 777 }),
      })
    );
  }
  const revs = await (
    await fetch(`${BASE}/api/revisions`, { headers: { Cookie: c } })
  ).json();
  const rid = Array.isArray(revs) ? revs[0]?.id : revs?.items?.[0]?.id;
  if (rid) {
    const d = await fetch(`${BASE}/api/revisions?id=${rid}`, {
      headers: { Cookie: c },
    });
    const b = await d.json();
    rows.push({
      path: "revisionDetail",
      status: d.status,
      blind: b.blind,
      items: Array.isArray(b.items) ? b.items.length : null,
      keys: b && typeof b === "object" ? Object.keys(b).slice(0, 12) : [],
    });
  }
  console.log(JSON.stringify(rows, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
