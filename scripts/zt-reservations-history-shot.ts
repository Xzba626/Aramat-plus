/**
 * One-shot: seller History → Резервы + cart TTL chips screenshots.
 *   npx tsx scripts/zt-reservations-history-shot.ts
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.ZT_BASE_URL ?? "http://127.0.0.1:3000";
const OUT = path.join(process.cwd(), "tmp", "reservations-history");

type Jar = Map<string, string>;

function storeCookies(jar: Jar, res: Response) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
}

function cookieHeader(jar: Jar) {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function loginJar(email: string, password: string): Promise<Jar> {
  const jar: Jar = new Map();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, {
    headers: { cookie: cookieHeader(jar) },
  });
  storeCookies(jar, csrfRes);
  const csrf = ((await csrfRes.json()) as { csrfToken: string }).csrfToken;
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: cookieHeader(jar),
    },
    body: new URLSearchParams({
      csrfToken: csrf,
      email,
      password,
      callbackUrl: `${BASE}/pos`,
      json: "true",
    }),
    redirect: "manual",
  });
  storeCookies(jar, res);
  console.log("login status", res.status, "cookies", [...jar.keys()]);
  const sess = await fetch(`${BASE}/api/auth/session`, {
    headers: { cookie: cookieHeader(jar) },
  });
  console.log("session", sess.status, await sess.json());
  if (jar.size === 0) throw new Error(`login failed for ${email}`);
  return jar;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const jar = await loginJar("seller@aromat.plus", "seller1234");
  const cookie = cookieHeader(jar);

  const catRes = await fetch(`${BASE}/api/pos/catalog`, {
    headers: { cookie },
  });
  const catRaw = await catRes.json();
  console.log("catalog status", catRes.status, Array.isArray(catRaw) ? `array ${catRaw.length}` : Object.keys(catRaw ?? {}));
  const cat = catRaw as {
    items?: Array<{
      productId?: string;
      availableQty?: number | string;
      available?: number | string;
      product?: { id: string; name: string };
    }>;
  };
  const items = Array.isArray(catRaw)
    ? (catRaw as typeof cat.items)
    : (cat.items ?? []);
  const list = items ?? [];
  const pick =
    list.find((i) => Number(i.availableQty ?? i.available ?? 0) > 0) ??
    list[0];
  if (!pick) {
    console.log("catalog body", JSON.stringify(catRaw).slice(0, 800));
    // Still screenshot empty history tab
  } else {
    const productId = pick.product?.id ?? pick.productId;
    if (productId) {
      const create = await fetch(`${BASE}/api/reservations`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          ttlMinutes: 30,
          customerNote: "Скриншот: клиент зайдёт через полчаса",
          items: [{ productId, quantity: 1 }],
        }),
      });
      const created = await create.json();
      console.log(
        "create",
        create.status,
        created.id ?? created.error ?? created
      );
    }
  }

  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
  });
  const context = await browser.newContext({
    viewport: { width: 430, height: 900 },
  });
  const url = new URL(BASE);
  await context.addCookies(
    [...jar.entries()].map(([name, value]) => ({
      name,
      value,
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax" as const,
    }))
  );

  const page = await context.newPage();

  await page.goto(`${BASE}/pos/cart`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: path.join(OUT, "01-cart-ttl.png"),
    fullPage: true,
  });

  await page.goto(`${BASE}/pos/history?tab=reservations`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForFunction(
    () => !/Загрузка|Loading/i.test(document.body?.innerText ?? ""),
    { timeout: 45_000 }
  );
  await page.waitForTimeout(800);
  await page.screenshot({
    path: path.join(OUT, "02-history-reservations.png"),
    fullPage: true,
  });

  await browser.close();
  console.log("screenshots →", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
