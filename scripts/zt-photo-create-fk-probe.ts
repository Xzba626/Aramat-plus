const BASE = process.env.ZT_BASE_URL ?? "http://127.0.0.1:3000";

async function login() {
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
      email: "owner@aromat.plus",
      password: "owner1234",
      callbackUrl: `${BASE}/`,
      json: "true",
    }),
    redirect: "manual",
  });
  absorb(res.headers);
  return cookie();
}

async function main() {
  const cookie = await login();
  const cases = [
    {
      name: "empty_category",
      body: {
        name: "E2E EmptyCat",
        categoryId: "",
        accountingType: "PIECE",
        salePrice: 10,
        defaultCostPerUnit: 5,
      },
    },
    {
      name: "bad_category",
      body: {
        name: "E2E BadCat",
        categoryId: "clxxxxxxxxxxxxxxxxxxxxxxxxx",
        accountingType: "PIECE",
        salePrice: 10,
        defaultCostPerUnit: 5,
      },
    },
  ];
  for (const c of cases) {
    const r = await fetch(`${BASE}/api/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(c.body),
    });
    const b = await r.json();
    console.log(JSON.stringify({ case: c.name, http: r.status, error: b.error }));
  }
}

main();
