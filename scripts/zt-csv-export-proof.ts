/**
 * Prove human-readable CSV export (RU headers, ; separator, no raw enums).
 * Run: npx tsx scripts/zt-csv-export-proof.ts
 */
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.ZT_BASE_URL ?? "http://127.0.0.1:3000";
const PASS = process.env.ZT_OWNER_PASSWORD ?? "owner1234";
const OUT = path.join(process.cwd(), "tmp", "csv-export-after");

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

async function login(): Promise<Jar> {
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
      password: PASS,
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
  const types = ["products", "sales", "expenses", "analytics"] as const;
  const report: Record<string, unknown> = {};

  for (const type of types) {
    const url = `${BASE}/api/export?type=${type}&period=month&lang=ru`;
    const res = await fetch(url, { headers: { cookie: cookieHeader(jar) } });
    const text = await res.text();
    const file = path.join(OUT, `aramat-${type}-month.csv`);
    fs.writeFileSync(file, text, "utf8");
    const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/)[0] ?? "";
    const hasSemicolon = firstLine.includes(";");
    const hasEnglishHeader = /^(id,name|metric,value|id,createdAt)/i.test(
      firstLine
    );
    const hasIsoDate = /T\d{2}:\d{2}:\d{2}\.\d{3}Z/.test(text);
    const hasRawEnum = /;(ONCE|MONTHLY|COMPLETED)(;|\r|\n|$)/.test(text);
    report[type] = {
      status: res.status,
      header: firstLine.slice(0, 120),
      hasSemicolon,
      hasEnglishHeader,
      hasIsoDate,
      hasRawEnum,
      ok:
        res.ok &&
        hasSemicolon &&
        !hasEnglishHeader &&
        !hasIsoDate &&
        !hasRawEnum,
    };
  }

  console.log(JSON.stringify(report, null, 2));
  const failed = Object.entries(report).filter(
    ([, v]) => !(v as { ok: boolean }).ok
  );
  if (failed.length) {
    console.error("FAIL", failed.map(([k]) => k).join(", "));
    process.exit(1);
  }
  console.log("PASS — CSV exports human-readable →", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
