/**
 * Read-only MANAGER HTTP audit (mutations only probe for 403).
 * Run: npx tsx scripts/zt-manager-rbac-http-audit.ts
 */
const BASE = process.env.ZT_BASE_URL || "http://127.0.0.1:3000";

async function login(email: string, password: string) {
  const jar = new Map<string, string>();
  const absorb = (headers: Headers) => {
    const list =
      typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
    for (const raw of list) {
      const part = raw.split(";")[0];
      const eq = part.indexOf("=");
      if (eq > 0) jar.set(part.slice(0, eq), part.slice(eq + 1));
    }
  };
  const cookieHeader = () =>
    [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  absorb(csrfRes.headers);

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
  return { status: res.status, cookie: cookieHeader(), keys: [...jar.keys()] };
}

async function api(cookie: string, path: string, init?: RequestInit) {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Cookie: cookie,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
    redirect: "manual",
  });
}

async function main() {
  const email = process.env.ZT_MANAGER_EMAIL || "manager@aromat.plus";
  const password = process.env.ZT_MANAGER_PASSWORD || "manager1234";
  const { cookie, status, keys } = await login(email, password);
  if (!keys.some((k) => /session/i.test(k))) {
    throw new Error(`login failed keys=${keys.join(",")}`);
  }

  const rows: Array<{ check: string; status: number; note: string }> = [
    { check: "login", status, note: email },
  ];

  const gets = [
    ["/api/dashboard", "dashboard"],
    ["/api/analytics?period=month", "analytics"],
    ["/api/journal", "journal API"],
    ["/api/stores", "stores"],
    ["/api/products", "products"],
    ["/api/packaging-skus", "packaging"],
    ["/api/expenses", "expenses list"],
    ["/api/users", "users list API"],
    ["/api/export?type=sales", "export"],
    ["/api/revisions", "revisions"],
    ["/api/company", "company GET"],
    ["/settings/wipe", "wipe page"],
    ["/users", "users page"],
    ["/warehouse/write-offs", "write-offs page"],
    ["/journal", "journal page"],
  ] as const;

  for (const [path, label] of gets) {
    const res = await api(cookie, path);
    const loc = res.headers.get("location");
    rows.push({
      check: label,
      status: res.status,
      note: loc ? `→ ${loc}` : res.ok ? "ok" : (await res.text()).slice(0, 60),
    });
  }

  const productsRes = await api(cookie, "/api/products");
  const products = productsRes.ok
    ? ((await productsRes.json()) as Array<{ id: string }>)
    : [];
  const pid = products[0]?.id;

  const muts: Array<[string, string, RequestInit]> = [
    ["POST expenses", "/api/expenses", { method: "POST", body: "{}" }],
    ["POST products", "/api/products", { method: "POST", body: "{}" }],
    [
      "POST wipe",
      "/api/settings/wipe",
      { method: "POST", body: JSON.stringify({ confirmPhrase: "NO" }) },
    ],
    [
      "PATCH company",
      "/api/company",
      { method: "PATCH", body: JSON.stringify({ name: "X" }) },
    ],
  ];
  if (pid) {
    muts.push([
      "PATCH product",
      `/api/products/${pid}`,
      { method: "PATCH", body: JSON.stringify({ name: "hack" }) },
    ]);
    muts.push([
      "POST product cost",
      `/api/products/${pid}/cost`,
      { method: "POST", body: JSON.stringify({ defaultCostPerUnit: 99 }) },
    ]);
  }

  // packaging PATCH cost probe — find sku
  const packRes = await api(cookie, "/api/packaging-skus");
  if (packRes.ok) {
    const skus = (await packRes.json()) as Array<{ id: string }>;
    if (skus[0]) {
      muts.push([
        "PATCH packaging defaultCost",
        "/api/packaging-skus",
        {
          method: "PATCH",
          body: JSON.stringify({ id: skus[0].id, defaultCost: 777 }),
        },
      ]);
    }
  }

  for (const [label, path, init] of muts) {
    const res = await api(cookie, path, init);
    rows.push({
      check: label,
      status: res.status,
      note:
        res.status === 403
          ? "403 denied"
          : res.status === 400
            ? "400 validation (reached handler)"
            : `${res.status} ${(await res.text()).slice(0, 80)}`,
    });
  }

  // revision detail blind check
  const revList = await api(cookie, "/api/revisions");
  if (revList.ok) {
    const raw = await revList.json();
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.items)
        ? raw.items
        : [];
    if (list[0]?.id) {
      const d = await api(cookie, `/api/revisions?id=${list[0].id}`);
      const body = d.ok ? await d.json() : null;
      rows.push({
        check: "revision detail",
        status: d.status,
        note: body
          ? `blind=${body.blind} itemsLen=${Array.isArray(body.items) ? body.items.length : "n/a"}`
          : "fail",
      });
    }
  }

  console.log(JSON.stringify({ base: BASE, rows }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
