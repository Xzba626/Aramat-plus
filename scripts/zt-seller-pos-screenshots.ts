/**
 * Seller POS UI screenshots after bottle/stock-blind fix.
 * Prefer production server (dev Turbopack HMR breaks Playwright hydration):
 *   ZT_BASE_URL=http://127.0.0.1:3001 npx tsx scripts/zt-seller-pos-screenshots.ts
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.ZT_BASE_URL ?? "http://127.0.0.1:3000";
const OUT = path.join(process.cwd(), "tmp", "seller-pos-after");

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
  if (jar.size === 0) throw new Error(`login failed for ${email}`);
  return jar;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const jar = await loginJar("seller@aromat.plus", "seller1234");
  const sess = await fetch(`${BASE}/api/auth/session`, {
    headers: { cookie: cookieHeader(jar) },
  });
  console.log("session role:", (await sess.json())?.user?.role);

  const catRes = await fetch(`${BASE}/api/pos/catalog`, {
    headers: { cookie: cookieHeader(jar) },
  });
  const cat = (await catRes.json()) as {
    items: Array<{
      product: { name: string; accountingType?: string; kind?: string };
    }>;
  };
  const packagingNames = (cat.items ?? [])
    .filter(
      (i) =>
        i.product.kind === "PACKAGING" || /^флакон\b/i.test(i.product.name)
    )
    .map((i) => i.product.name);
  const weightItem = (cat.items ?? []).find(
    (i) =>
      i.product.accountingType === "WEIGHT" &&
      i.product.kind !== "PACKAGING" &&
      !/^флакон\b/i.test(i.product.name)
  );
  console.log("api packaging in catalog:", packagingNames.length);
  console.log("weight pick:", weightItem?.product.name);
  if (!weightItem) throw new Error("no WEIGHT item in catalog");

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
  await page.goto(`${BASE}/pos`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(
    () => !/Загрузка|Loading/i.test(document.body?.innerText ?? ""),
    { timeout: 45000 }
  );
  await page.waitForTimeout(400);

  await page.screenshot({
    path: path.join(OUT, "01-catalog-no-bottles-no-max.png"),
    fullPage: true,
  });

  const catalogText = await page.locator("body").innerText();
  const bottleInCatalog =
    /флакон\s+\d+\s*мл/i.test(catalogText) ||
    (/^флакон\b/im.test(catalogText) && /0\s*сомони/i.test(catalogText));
  const maxInCatalog = /макс\s+\d+/i.test(catalogText);
  console.log({ bottleInCatalog, maxInCatalog, packagingApi: packagingNames.length });

  await page
    .locator("button.rounded-2xl.border")
    .filter({ hasText: weightItem.product.name })
    .first()
    .click({ force: true });

  await page.locator(".fixed.inset-0").waitFor({ state: "visible", timeout: 10000 });
  await page.locator(".fixed.inset-0 select").waitFor({ state: "visible", timeout: 20000 });

  await page.screenshot({
    path: path.join(OUT, "02-weight-bottle-modal.png"),
    fullPage: true,
  });

  await page.locator(".fixed.inset-0 input[type='number']").fill("10");
  await page.waitForFunction(() => {
    const s = document.querySelector(".fixed.inset-0 select") as HTMLSelectElement | null;
    return !!s && s.options.length > 1;
  }, { timeout: 15000 });

  const select = page.locator(".fixed.inset-0 select");
  const bottleValue = await select.locator("option").nth(1).getAttribute("value");
  if (!bottleValue) throw new Error("no bottle option");
  await select.selectOption(bottleValue);
  await page.waitForTimeout(200);

  await page
    .locator(".fixed.inset-0")
    .getByRole("button", { name: /в корзину|добавить/i })
    .click();

  // Wait for modal to close = add succeeded
  await page.locator(".fixed.inset-0").waitFor({ state: "hidden", timeout: 10000 });

  const fab = page.locator("button").filter({ hasText: /Корзина/ });
  await fab.first().click();
  await page.waitForURL(/\/pos\/cart/, { timeout: 10000 });
  await page.waitForTimeout(800);

  await page.screenshot({
    path: path.join(OUT, "03-cart-perfume-line-only.png"),
    fullPage: true,
  });

  const cartText = await page.locator("body").innerText();
  const hasMax = /макс\s+\d+/i.test(cartText);
  const cartEmpty = /корзина пуста/i.test(cartText);
  const hasPerfumeLine = cartText.includes(weightItem.product.name);
  const bottleAsOwnLine =
    /(?:^|\n)\s*флакон\b/i.test(cartText) && /0\s*сомони/i.test(cartText);

  console.log({
    hasMax,
    cartEmpty,
    hasPerfumeLine,
    bottleAsOwnLine,
    cartSnippet: cartText.slice(0, 800),
  });
  console.log("screenshots →", OUT);
  await browser.close();

  if (
    packagingNames.length > 0 ||
    bottleInCatalog ||
    hasMax ||
    bottleAsOwnLine ||
    cartEmpty ||
    !hasPerfumeLine
  ) {
    console.error("FAIL");
    process.exit(1);
  }
  console.log("PASS — seller POS after screenshots OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
