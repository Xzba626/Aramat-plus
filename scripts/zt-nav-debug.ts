import { chromium } from "playwright-core";

const BASE = process.env.ZT_BASE_URL ?? "http://127.0.0.1:3000";
const pass = process.env.ZT_OWNER_PASSWORD ?? "owner1234";

async function login() {
  const jar = new Map<string, string>();
  const store = (r: Response) => {
    for (const c of r.headers.getSetCookie?.() ?? []) {
      const [p] = c.split(";");
      const i = p.indexOf("=");
      if (i > 0) jar.set(p.slice(0, i), p.slice(i + 1));
    }
  };
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  store(csrfRes);
  const csrf = ((await csrfRes.json()) as { csrfToken: string }).csrfToken;
  const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie,
    },
    body: new URLSearchParams({
      csrfToken: csrf,
      email: "owner@aromat.plus",
      password: pass,
      callbackUrl: `${BASE}/dashboard`,
      json: "true",
    }),
    redirect: "manual",
  });
  store(res);
  return jar;
}

async function main() {
  const jar = await login();
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies(
    [...jar].map(([name, value]) => ({
      name,
      value,
      domain: "127.0.0.1",
      path: "/",
    }))
  );
  const page = await ctx.newPage();
  page.on("requestfailed", (r) => {
    console.log("REQFAIL", r.url(), r.failure()?.errorText);
  });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(2500);
  console.log("url", page.url());
  const reactInfo = await page.evaluate(() => {
    const el = document.querySelector("[data-owner-shell]");
    const keys = el ? Object.keys(el).filter((k) => k.startsWith("__react")) : [];
    return {
      reactKeys: keys,
      nextData: Boolean(document.getElementById("__NEXT_DATA__")),
      scriptCount: document.scripts.length,
      scriptSamples: [...document.scripts]
        .map((s) => s.src)
        .filter(Boolean)
        .slice(0, 8),
    };
  });
  console.log("reactInfo", reactInfo);
  const info = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    shell: document.querySelector("[data-owner-shell]")?.getAttribute("data-owner-shell"),
    navOpen: document.querySelector("[data-nav-open]")?.getAttribute("data-nav-open"),
    boot: document.documentElement.dataset.shellBoot ?? null,
    bodyStart: document.body?.innerText?.slice(0, 200) ?? "",
    open: document
      .querySelector("[data-owner-menu]")
      ?.getAttribute("data-owner-menu-open"),
    drawer: document
      .querySelector("[data-drawer-open]")
      ?.getAttribute("data-drawer-open"),
    btnCount: document.querySelectorAll("[data-owner-menu]").length,
    label: document.querySelector("[data-owner-menu]")?.getAttribute("aria-label"),
  }));
  console.log("before", info);
  if (info.btnCount < 1) {
    console.log("pageerrors", errs);
    await page.screenshot({ path: "tmp/nav-debug-fail.png" });
    throw new Error("no menu button");
  }
  await page.locator("[data-owner-menu]").click({ force: true });
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => ({
    menuBtn: document.documentElement.dataset.menuBtn ?? null,
    toggle: document.documentElement.dataset.shellToggle ?? null,
    boot: document.documentElement.dataset.shellBoot ?? null,
    open: document
      .querySelector("[data-owner-menu]")
      ?.getAttribute("data-owner-menu-open"),
    navOpen: document.querySelector("[data-nav-open]")?.getAttribute("data-nav-open"),
  }));
  console.log("after", after);
  console.log("pageerrors", errs);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
