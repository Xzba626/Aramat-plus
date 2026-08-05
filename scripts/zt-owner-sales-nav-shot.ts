/**
 * Proof: owner sidebar has top-level «Продажи владельца» → same POS screen.
 *   ZT_BASE_URL=http://127.0.0.1:3000 npx tsx scripts/zt-owner-sales-nav-shot.ts
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.ZT_BASE_URL ?? "http://127.0.0.1:3000";
const EMAIL = process.env.ZT_OWNER_EMAIL ?? "owner@aromat.plus";
const PASS = process.env.ZT_OWNER_PASSWORD ?? "owner1234";
const OUT = path.join(process.cwd(), "tmp", "owner-sales-nav");

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

async function loginJar(): Promise<Jar> {
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
      email: EMAIL,
      password: PASS,
      callbackUrl: `${BASE}/dashboard`,
      json: "true",
    }),
    redirect: "manual",
  });
  storeCookies(jar, res);
  if (![...jar.keys()].some((k) => k.includes("session-token"))) {
    throw new Error(`login failed: ${res.status}`);
  }
  return jar;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const jar = await loginJar();
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const url = new URL(BASE);
  await context.addCookies(
    [...jar.entries()].map(([name, value]) => ({
      name,
      value,
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "Lax" as const,
    }))
  );

  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  const navText = await page.locator("body").innerText();
  const hasItem = /Продажи владельца|Фурӯши соҳиб/.test(navText);
  await page.screenshot({
    path: path.join(OUT, "01-sidebar-dashboard.png"),
    fullPage: false,
  });

  await page.goto(`${BASE}/owner-sales`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/stores\/[^/]+\/pos|\/stores\/?$/, { timeout: 45000 });
  await page.waitForTimeout(1200);
  const afterUrl = page.url();
  const onPos = /\/stores\/[^/]+\/pos/.test(afterUrl);
  await page.screenshot({
    path: path.join(OUT, "02-owner-sales-pos.png"),
    fullPage: false,
  });

  console.log(
    JSON.stringify({ hasItem, afterUrl, onPos, OUT }, null, 2)
  );
  await browser.close();
  if (!hasItem || !onPos) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
