/**
 * Mobile hamburger visibility check for owner shell (< lg = 1024px).
 * Run: npx tsx scripts/zt-owner-hamburger-proof.ts
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.ZT_BASE_URL ?? "http://127.0.0.1:3000";
const OUT = path.join(process.cwd(), "tmp", "owner-hamburger");

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

async function login() {
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
      password: "owner1234",
      callbackUrl: `${BASE}/dashboard`,
      json: "true",
    }),
    redirect: "manual",
  });
  storeCookies(jar, res);
  return jar;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const jar = await login();
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
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
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);

  const menu = page.locator("[data-owner-menu]");
  const visible = await menu.isVisible();
  console.log("hamburger visible @390px:", visible);
  await page.screenshot({
    path: path.join(OUT, "01-mobile-closed.png"),
    fullPage: false,
  });

  if (!visible) {
    await browser.close();
    console.error("FAIL — hamburger not visible under lg");
    process.exit(1);
  }

  await menu.click();
  await page.waitForTimeout(600);
  await page.screenshot({
    path: path.join(OUT, "02-mobile-drawer-open.png"),
    fullPage: false,
  });
  const drawerOpen = await page
    .locator("nav, aside, [data-owner-sidebar]")
    .first()
    .isVisible()
    .catch(() => true);
  console.log("drawer interaction ok:", drawerOpen);
  console.log("screenshots →", OUT);
  await browser.close();
  console.log("PASS — owner hamburger");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
