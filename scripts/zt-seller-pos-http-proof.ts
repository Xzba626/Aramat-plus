/**
 * HTTP: seller catalog has no bottles / no exact stock labels in POS HTML.
 * Run: npx tsx scripts/zt-seller-pos-http-proof.ts
 */
import assert from "node:assert/strict";

const BASE = process.env.ZT_BASE_URL ?? "http://127.0.0.1:3000";

type Jar = Map<string, string>;

function storeCookies(jar: Jar, res: Response) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const c of raw) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}

function cookieHeader(jar: Jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function login(email: string, password: string): Promise<Jar> {
  const jar: Jar = new Map();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, {
    headers: { cookie: cookieHeader(jar) },
  });
  storeCookies(jar, csrfRes);
  const csrf = ((await csrfRes.json()) as { csrfToken: string }).csrfToken;
  const body = new URLSearchParams({
    csrfToken: csrf,
    email,
    password,
    callbackUrl: `${BASE}/pos`,
    json: "true",
  });
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: cookieHeader(jar),
    },
    body,
    redirect: "manual",
  });
  storeCookies(jar, res);
  assert.ok(jar.size > 0, `login failed for ${email}`);
  return jar;
}

async function main() {
  console.log("=== ZT seller POS HTTP ===\n");
  const jar = await login("seller@aromat.plus", "seller1234");
  const sess = await fetch(`${BASE}/api/auth/session`, {
    headers: { cookie: cookieHeader(jar) },
  });
  console.log("session", await sess.json());

  const catRes = await fetch(`${BASE}/api/pos/catalog`, {
    headers: { cookie: cookieHeader(jar) },
  });
  const catBody = await catRes.json();
  if (catRes.status !== 200) {
    console.error("catalog fail", catRes.status, catBody);
  }
  assert.equal(catRes.status, 200, `catalog ${catRes.status}`);
  const cat = catBody as {
    items: Array<{
      productId: string;
      quantity: number;
      salePrice: number;
      product: { name: string; kind?: string };
    }>;
  };
  const bottles = (cat.items ?? []).filter(
    (i) =>
      i.product.kind === "PACKAGING" ||
      /^флакон\b/i.test(i.product.name) ||
      (i.salePrice === 0 && /^флакон\b/i.test(i.product.name))
  );
  assert.equal(
    bottles.length,
    0,
    `packaging bottles in catalog: ${JSON.stringify(bottles)}`
  );
  console.log("✓ GET /api/pos/catalog — no PACKAGING/Флакон,", cat.items.length, "items");

  const botRes = await fetch(`${BASE}/api/pos/packaging-bottles`, {
    headers: { cookie: cookieHeader(jar) },
  });
  assert.equal(botRes.status, 200);
  const bots = (await botRes.json()) as Array<Record<string, unknown>>;
  assert.ok(Array.isArray(bots));
  for (const b of bots) {
    assert.equal(
      "quantity" in b,
      false,
      "seller bottle list must not include quantity"
    );
    assert.equal(
      "defaultCost" in b,
      false,
      "seller bottle list must not include defaultCost"
    );
  }
  console.log("✓ GET /api/pos/packaging-bottles — no qty/cost for seller,", bots.length);

  const page = await fetch(`${BASE}/pos`, {
    headers: { cookie: cookieHeader(jar) },
  });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(!/макс\s*\d/i.test(html), "POS HTML should not embed макс N");
  console.log("✓ GET /pos page 200 (client UI hides qty; SSR shell ok)");

  console.log("\nPASS — seller POS HTTP");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
