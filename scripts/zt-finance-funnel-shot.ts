/**
 * Screenshot Owner Dashboard finance funnel after UX fix.
 * Run: npx tsx scripts/zt-finance-funnel-shot.ts
 * Env: ZT_BASE_URL, ZT_OWNER_PASSWORD (defaults try owner1234)
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.ZT_BASE_URL ?? "http://127.0.0.1:3000";
const OUT = path.join(process.cwd(), "tmp", "finance-funnel-after");
const PASSWORDS = [
  process.env.ZT_OWNER_PASSWORD,
  "owner1234",
].filter(Boolean) as string[];

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

async function login(password: string): Promise<Jar | null> {
  const jar: Jar = new Map();
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
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
      email: "owner@aromat.plus",
      password,
      callbackUrl: `${BASE}/dashboard`,
      json: "true",
    }),
    redirect: "manual",
  });
  storeCookies(jar, res);
  const session = await fetch(`${BASE}/api/auth/session`, {
    headers: { cookie: cookieHeader(jar) },
  });
  const json = (await session.json()) as { user?: { email?: string } };
  if (!json?.user?.email) return null;
  return jar;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let jar: Jar | null = null;
  for (const p of PASSWORDS) {
    jar = await login(p);
    if (jar) break;
  }
  if (!jar) throw new Error("Owner login failed — set ZT_OWNER_PASSWORD");

  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  const url = new URL(BASE);
  await context.addCookies(
    [...jar.entries()].map(([name, value]) => ({
      name,
      value,
      domain: url.hostname,
      path: "/",
    }))
  );
  const page = await context.newPage();
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);

  // Prefer RU labels if locale switch exists; otherwise shoot as-is
  const body = await page.locator("body").innerText();
  const hasFour =
    /Выручка|Даромад/.test(body) &&
    /Валовая|Фоидаи умумӣ/.test(body) &&
    /Расходы|Хароҷот/.test(body) &&
    /Чистая|Фоидаи соф/.test(body);
  const hasPctInToday = /%/.test(body.slice(0, 2500));
  const hasTable = /Прибыль магазинов|Фоидаи мағозаҳо/.test(body);

  await page.screenshot({
    path: path.join(OUT, "01-dashboard-top.png"),
    fullPage: false,
  });
  await page.evaluate(() => window.scrollTo(0, 420));
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(OUT, "02-funnel-area.png"),
    fullPage: false,
  });
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(OUT, "03-stores-table.png"),
    fullPage: false,
  });
  await page.screenshot({
    path: path.join(OUT, "04-full.png"),
    fullPage: true,
  });

  console.log(
    JSON.stringify(
      { out: OUT, hasFour, hasPctInToday, hasTable, sample: body.slice(0, 400) },
      null,
      2
    )
  );
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
