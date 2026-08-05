/**
 * Production screenshots for /reports + expenses xlsx description sample.
 * Needs ZT_OWNER_PASSWORD (or ZT_OWNER_EMAIL + password).
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import * as XLSX from "xlsx";

const BASE =
  process.env.ZT_BASE_URL ?? "https://aramat-plus.vercel.app";
const EMAIL = process.env.ZT_OWNER_EMAIL ?? "owner@aromat.plus";
const PASS = process.env.ZT_OWNER_PASSWORD ?? "";
const OUT = path.join(process.cwd(), "tmp", "reports-prod-proof");

async function main() {
  if (!PASS) {
    console.error("Set ZT_OWNER_PASSWORD to take production screenshots.");
    process.exit(2);
  }
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(90000);

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"], input[name="email"]', EMAIL);
  await page.fill('input[type="password"], input[name="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|stores|reports)/, { timeout: 60000 });

  await page.goto(`${BASE}/reports`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: path.join(OUT, "01-reports-full.png"),
    fullPage: true,
  });

  // Download expenses xlsx via cookie session
  const cookies = await context.cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const expRes = await fetch(
    `${BASE}/api/export?type=expenses&period=month&lang=ru`,
    { headers: { cookie: cookieHeader } }
  );
  if (!expRes.ok) {
    console.error("expenses export HTTP", expRes.status, await expRes.text());
  } else {
    const buf = Buffer.from(await expRes.arrayBuffer());
    const xlsxPath = path.join(OUT, "02-expenses.xlsx");
    fs.writeFileSync(xlsxPath, buf);
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
    });
    const descKey =
      Object.keys(rows[0] ?? {}).find((k) =>
        /описание|тавсиф|description/i.test(k)
      ) ?? "Описание";
    const sample = rows.slice(0, 15).map((r) => String(r[descKey] ?? ""));
    const techLeft = sample.filter((s) => /sale:[a-z0-9]{8,}/i.test(s));
    fs.writeFileSync(
      path.join(OUT, "03-expenses-desc-sample.json"),
      JSON.stringify({ descKey, sample, techLeft }, null, 2)
    );
    console.log("expenses rows", rows.length, "techLeftInSample", techLeft.length);
  }

  console.log("OUT", OUT);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
