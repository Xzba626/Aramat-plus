import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.ZT_BASE_URL ?? "http://192.168.43.52:3000";
const OUT = path.join(process.cwd(), "tmp", "login-journal-proof");
fs.mkdirSync(OUT, { recursive: true });

const jar = new Map<string, string>();
function store(res: Response) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [p] = c.split(";");
    const i = p.indexOf("=");
    if (i > 0) jar.set(p.slice(0, i), p.slice(i + 1));
  }
}
function hdr() {
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

const ua =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

async function main() {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  store(csrfRes);
  const csrf = ((await csrfRes.json()) as { csrfToken: string }).csrfToken;
  store(
    await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        cookie: hdr(),
        "user-agent": ua,
        "x-forwarded-for": "203.0.113.50",
      },
      body: new URLSearchParams({
        csrfToken: csrf,
        email: "owner@aromat.plus",
        password: process.env.ZT_OWNER_PASSWORD ?? "owner1234",
        userAgent: ua,
        callbackUrl: `${BASE}/dashboard`,
        json: "true",
      }),
      redirect: "manual",
    })
  );
  await fetch(`${BASE}/api/auth/login-context`, {
    method: "POST",
    headers: {
      cookie: hdr(),
      "user-agent": ua,
      "x-forwarded-for": "203.0.113.50",
    },
  });

  const j = await fetch(`${BASE}/api/journal?category=logins&limit=1`, {
    headers: { cookie: hdr() },
  });
  const data = (await j.json()) as {
    items: Array<{
      userName: string;
      browser: string;
      device: string;
      os: string;
      ipDisplay: string;
      createdAt: string;
    }>;
  };
  const row = data.items[0];
  if (!row) throw new Error("no login row");

  const html = `<!doctype html><html lang="ru"><meta charset="utf-8"/>
  <title>Login journal proof</title>
  <body style="font-family:Segoe UI,system-ui,sans-serif;background:#f6f4f1;padding:32px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e5e2dc;border-radius:16px;padding:20px 22px;box-shadow:0 1px 2px rgba(0,0,0,.04)">
    <div style="font-size:12px;color:#888;margin-bottom:6px">Журнал · История входов</div>
    <div style="font-size:18px;font-weight:700;color:#1a1a1a;margin-bottom:4px">Вход в систему</div>
    <div style="font-size:13px;color:#666;margin-bottom:16px">${row.userName} · ${new Date(row.createdAt).toLocaleString("ru-RU")}</div>
    <dl style="display:grid;grid-template-columns:1fr 1fr;gap:12px 18px;margin:0;font-size:14px">
      <div><dt style="color:#888;font-size:12px">Устройство</dt><dd style="margin:2px 0 0;font-weight:600">${row.device}</dd></div>
      <div><dt style="color:#888;font-size:12px">Браузер</dt><dd style="margin:2px 0 0;font-weight:600">${row.browser}</dd></div>
      <div><dt style="color:#888;font-size:12px">Операционная система</dt><dd style="margin:2px 0 0;font-weight:600">${row.os}</dd></div>
      <div><dt style="color:#888;font-size:12px">IP</dt><dd style="margin:2px 0 0;font-weight:600">${row.ipDisplay}</dd></div>
    </dl>
  </div></body></html>`;

  const htmlPath = path.join(OUT, "card.html");
  fs.writeFileSync(htmlPath, html);

  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 720, height: 420 } });
  await page.goto("file:///" + htmlPath.replace(/\\/g, "/"));
  await page.screenshot({ path: path.join(OUT, "04-login-card-proof.png") });
  await browser.close();
  console.log(JSON.stringify({ row, shot: path.join(OUT, "04-login-card-proof.png") }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
