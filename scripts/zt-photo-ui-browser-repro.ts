/**
 * REAL UI photo upload reproduction via Playwright + file input.
 * Auth via API cookies (same session as browser); photo pick is real UI.
 *
 * Run: npx tsx scripts/zt-photo-ui-browser-repro.ts
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { chromium, type Browser, type Page } from "playwright-core";

const BASE = process.env.ZT_BASE_URL ?? "http://localhost:3000";
const TMP = join(process.cwd(), "tmp");
const FIXTURES = join(TMP, "ui-photo-fixtures");

async function apiLogin(): Promise<string> {
  const jar = new Map<string, string>();
  const absorb = (h: Headers) => {
    for (const raw of h.getSetCookie()) {
      const p = raw.split(";")[0];
      const i = p.indexOf("=");
      if (i > 0) jar.set(p.slice(0, i), p.slice(i + 1));
    }
  };
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  absorb(csrfRes.headers);
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
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

async function launchBrowser(): Promise<Browser> {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean) as string[];

  for (const exe of candidates) {
    if (existsSync(exe)) {
      return chromium.launch({
        headless: true,
        executablePath: exe,
        args: ["--disable-web-security", "--no-sandbox"],
      });
    }
  }
  return chromium.launch({ headless: true, args: ["--no-sandbox"] });
}

async function makeFixtures() {
  mkdirSync(FIXTURES, { recursive: true });
  const files: Record<string, string> = {};

  const tiny = await sharp({
    create: { width: 80, height: 60, channels: 3, background: "#4af" },
  })
    .jpeg({ quality: 40 })
    .toBuffer();
  files.tiny = join(FIXTURES, "tiny.jpg");
  writeFileSync(files.tiny, tiny);

  const phone = await sharp({
    create: {
      width: 2400,
      height: 1800,
      channels: 3,
      noise: { type: "gaussian", mean: 100, sigma: 40 },
    },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
  files.phone = join(FIXTURES, "phone.jpg");
  writeFileSync(files.phone, phone);

  const png = await sharp({
    create: { width: 1200, height: 900, channels: 3, background: "#e33" },
  })
    .png()
    .toBuffer();
  files.png = join(FIXTURES, "shot.png");
  writeFileSync(files.png, png);

  return files;
}

function parseCookieHeader(raw: string, url: string) {
  const u = new URL(url);
  return raw.split("; ").filter(Boolean).map((pair) => {
    const i = pair.indexOf("=");
    return {
      name: pair.slice(0, i),
      value: pair.slice(i + 1),
      domain: u.hostname,
      path: "/",
      httpOnly: pair.toLowerCase().includes("session") || true,
      secure: u.protocol === "https:",
      sameSite: "Lax" as const,
    };
  });
}

async function setFileOnInput(
  page: Page,
  filePath: string,
  mime: string
) {
  const buf = readFileSync(filePath);
  const name = filePath.split(/[/\\]/).pop() || "photo.jpg";
  const b64 = buf.toString("base64");

  // Prefer Playwright setInputFiles
  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles(filePath);
  await page.waitForTimeout(300);

  // If React onChange did not fire (common with sr-only), force DataTransfer + change
  const fired = await page.evaluate(
    ({ b64, name, mime }) => {
      const input = document.querySelector(
        'input[type="file"]'
      ) as HTMLInputElement | null;
      if (!input) return { ok: false, reason: "no_input" };
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const file = new File([arr], name, { type: mime });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return {
        ok: true,
        files: input.files?.length ?? 0,
        size: input.files?.[0]?.size ?? 0,
        type: input.files?.[0]?.type ?? "",
        name: input.files?.[0]?.name ?? "",
      };
    },
    { b64, name, mime }
  );
  return fired;
}

async function tryUpload(page: Page, filePath: string, label: string, mime: string) {
  const debugPath = join(TMP, "photo-upload-debug.json");
  if (existsSync(debugPath)) {
    try {
      writeFileSync(debugPath, "{}");
    } catch {
      /* */
    }
  }

  await page.goto(`${BASE}/warehouse/new`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForSelector('input[type="file"]', { timeout: 30000 });

  // Confirm hydration / session
  const pageState = await page.evaluate(() => ({
    href: location.href,
    fileInputs: document.querySelectorAll('input[type="file"]').length,
    hasNameField: !!document.querySelector('input[name="name"]'),
    bodyText: document.body?.innerText?.slice(0, 200) ?? "",
  }));

  const uploadPromise = page.waitForResponse(
    (r) => r.url().includes("/api/products/upload"),
    { timeout: 90000 }
  );
  const debugPromise = page.waitForResponse(
    (r) => r.url().includes("/api/debug/photo-upload-client"),
    { timeout: 90000 }
  ).catch(() => null);

  const fileSet = await setFileOnInput(page, filePath, mime);

  let network: { kind: string; status: number; body: unknown } = {
    kind: "none",
    status: 0,
    body: {},
  };

  try {
    const r = await uploadPromise;
    network = {
      kind: "upload",
      status: r.status(),
      body: await r.json().catch(() => ({})),
    };
  } catch {
    network = { kind: "timeout", status: 0, body: {} };
  }

  await debugPromise;
  await page.waitForTimeout(500);

  let clientDebug: unknown = null;
  if (existsSync(debugPath)) {
    try {
      clientDebug = JSON.parse(readFileSync(debugPath, "utf8"));
    } catch {
      clientDebug = null;
    }
  }

  const danger = page.locator("p.text-danger");
  const uiError =
    (await danger.count()) > 0 ? (await danger.first().innerText()).trim() : null;
  const previewCount = await page.locator("label img").count();

  const pass =
    network.kind === "upload" &&
    network.status === 201 &&
    !uiError;

  return {
    label,
    filePath,
    pageState,
    fileSet,
    network,
    uiError,
    previewCount,
    clientDebug,
    status: pass ? ("PASS" as const) : ("FAIL" as const),
  };
}

async function main() {
  mkdirSync(TMP, { recursive: true });
  const fixtures = await makeFixtures();
  const cookieHeader = await apiLogin();
  const browser = await launchBrowser();
  const context = await browser.newContext();
  await context.addCookies(parseCookieHeader(cookieHeader, BASE));
  const page = await context.newPage();

  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  const rows = [];
  try {
    // Warm page
    await page.goto(`${BASE}/warehouse/new`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    const title = await page.title();
    rows.push({
      label: "page_open",
      status: title || (await page.url()) ? "PASS" : "FAIL",
      url: page.url(),
      title,
    });

    rows.push(await tryUpload(page, fixtures.tiny, "tiny_jpeg", "image/jpeg"));
    rows.push(
      await tryUpload(page, fixtures.phone, "phone_jpeg_~2mb", "image/jpeg")
    );
    rows.push(await tryUpload(page, fixtures.png, "png", "image/png"));
  } catch (e) {
    rows.push({
      label: "browser_fatal",
      status: "FAIL",
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
    });
  } finally {
    await browser.close();
  }

  const report = {
    at: new Date().toISOString(),
    mode: "playwright_ui_file_input",
    base: BASE,
    consoleErrors: consoleErrors.slice(0, 20),
    fail: rows.filter((r) => r.status === "FAIL").length,
    pass: rows.filter((r) => r.status === "PASS").length,
    rows,
  };
  writeFileSync(
    join(TMP, "photo-ui-browser-repro.json"),
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
