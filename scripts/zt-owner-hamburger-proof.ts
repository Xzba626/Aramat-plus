/**
 * Prove hamburger toggle on mobile + desktop.
 * Run: npx tsx scripts/zt-owner-hamburger-proof.ts
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.ZT_BASE_URL ?? "http://127.0.0.1:3000";
const OUT = path.join(process.cwd(), "tmp", "owner-hamburger");
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
  return json?.user?.email ? jar : null;
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
  const url = new URL(BASE);

  async function shot(viewport: { width: number; height: number }, tag: string) {
    const context = await browser.newContext({ viewport });
    await context.addCookies(
      [...jar!.entries()].map(([name, value]) => ({
        name,
        value,
        domain: url.hostname,
        path: "/",
      }))
    );
    const page = await context.newPage();
    await page.goto(`${BASE}/dashboard`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(2000);

    const menu = page.locator("[data-owner-menu]");
    const visible = await menu.isVisible();
    const openAttr = await menu.getAttribute("data-owner-menu-open");
    console.log(`${tag}: hamburger visible=${visible} open=${openAttr}`);
    if (!visible) {
      await page.screenshot({
        path: path.join(OUT, `${tag}-FAIL-no-menu.png`),
      });
      throw new Error(`${tag}: hamburger not visible`);
    }

    await page.screenshot({
      path: path.join(OUT, `${tag}-01-initial.png`),
      fullPage: false,
    });

    // Toggle closed if open, then open again — prove Menu ↔ X
    if (openAttr === "1") {
      await menu.click();
      await page.waitForTimeout(500);
      const afterClose = await menu.getAttribute("data-owner-menu-open");
      console.log(`${tag}: after close open=${afterClose}`);
      if (afterClose !== "0") throw new Error(`${tag}: did not close`);
      await page.screenshot({
        path: path.join(OUT, `${tag}-02-closed.png`),
        fullPage: false,
      });
    }

    await menu.click();
    await page.waitForTimeout(500);
    const afterOpen = await menu.getAttribute("data-owner-menu-open");
    console.log(`${tag}: after open open=${afterOpen}`);
    if (afterOpen !== "1") throw new Error(`${tag}: did not open`);
    await page.screenshot({
      path: path.join(OUT, `${tag}-03-open.png`),
      fullPage: false,
    });

    await context.close();
  }

  await shot({ width: 390, height: 844 }, "mobile");
  await shot({ width: 1440, height: 900 }, "desktop");

  await browser.close();
  console.log("PASS — hamburger mobile + desktop →", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
