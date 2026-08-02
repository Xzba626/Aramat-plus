import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.ZT_BASE_URL ?? "http://127.0.0.1:3000";
const OUT = path.join(process.cwd(), "tmp", "login-security");

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  const text = await page.locator("body").innerText();
  await page.screenshot({ path: path.join(OUT, "login-after.png"), fullPage: true });
  const bad =
    /owner1234|owner@aromat\.plus\s*\/|Демо:|Регистрации нет|demo:/i.test(text);
  console.log({ bad, snippet: text.slice(0, 500) });
  console.log("screenshot →", path.join(OUT, "login-after.png"));
  await browser.close();
  if (bad) {
    console.error("FAIL — credentials or demo copy still visible");
    process.exit(1);
  }
  console.log("PASS — login page clean");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
