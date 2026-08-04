/**
 * Screenshots: Finance → Products + Company sales-performance settings.
 *   npx tsx scripts/zt-analytics-products-shot.ts
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.ZT_BASE_URL ?? "http://127.0.0.1:3000";
const OUT = path.join(process.cwd(), "tmp", "analytics-products");

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
      callbackUrl: `${BASE}/analytics?view=products`,
      json: "true",
    }),
    redirect: "manual",
  });
  storeCookies(jar, res);
  if (![...jar.keys()].some((k) => k.includes("session-token"))) {
    throw new Error(`login failed for ${email}`);
  }
  return jar;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const jar = await loginJar("owner@aromat.plus", "owner1234");
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
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
  await page.goto(`${BASE}/analytics?view=products`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForFunction(
    () => /Лидеры|Пешсафон|Товары|Молҳо/i.test(document.body?.innerText ?? ""),
    { timeout: 45_000 }
  );
  const productsTab = page.getByRole("button", { name: /Товары|Молҳо/i });
  if (await productsTab.count()) await productsTab.first().click();
  const monthBtn = page.getByRole("button", { name: /^Месяц$|^Моҳ$/i });
  if (await monthBtn.count()) await monthBtn.first().click();
  await page.waitForFunction(
    () => {
      const text = document.body?.innerText ?? "";
      return (
        /Топ продаж|Топ фурӯш/i.test(text) &&
        /Хорошо продаются|Хуб фурӯхта/i.test(text) &&
        /Parfum plus|Нет продаж за выбранный|Дар ин давра фурӯш нест/i.test(
          text
        ) &&
        !/ВЫРУЧКА[\s\S]{0,40}…/i.test(text)
      );
    },
    { timeout: 60_000 }
  );
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(OUT, "01-finance-products.png"),
    fullPage: true,
  });

  await page.goto(`${BASE}/settings/company`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForFunction(
    () => /продаваемости|фурӯшпазирӣ|низкого остатка/i.test(document.body?.innerText ?? ""),
    { timeout: 45_000 }
  );
  await page.waitForTimeout(500);
  const heading = page.getByText(/Пороги продаваемости|Ҳадҳои фурӯшпазирӣ/i);
  if (await heading.count()) {
    await heading.first().scrollIntoViewIfNeeded();
  }
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(OUT, "02-settings-sales-perf.png"),
    fullPage: true,
  });

  await browser.close();
  console.log("screenshots →", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
