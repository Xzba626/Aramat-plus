/**
 * RC0 High inventory (H1–H5) — read-only / HTTP probes. No mutations of business rules.
 * Run: npx tsx scripts/zt-rc0-high-inventory.ts
 */
import assert from "node:assert/strict";
import { PrismaClient, StoreKind } from "@prisma/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.ZT_BASE_URL ?? "http://127.0.0.1:3000";
const prisma = new PrismaClient();

async function login(email: string, password: string) {
  const jar = new Map<string, string>();
  const absorb = (h: Headers) => {
    for (const raw of h.getSetCookie()) {
      const p = raw.split(";")[0];
      const i = p.indexOf("=");
      if (i > 0) jar.set(p.slice(0, i), p.slice(i + 1));
    }
  };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  absorb(csrfRes.headers);
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie(),
    },
    body: new URLSearchParams({
      csrfToken,
      email,
      password,
      callbackUrl: `${BASE}/dashboard`,
      json: "true",
    }),
    redirect: "manual",
  });
  absorb(res.headers);
  return cookie();
}

async function main() {
  const rows: Array<{
    id: string;
    status: string;
    note: string;
  }> = [];

  // H1 — Manager transfers / warehouse / notifications still company-wide?
  const mgr = await prisma.user.findFirst({
    where: { email: "manager@aromat.plus" },
  });
  assert.ok(mgr?.storeId);
  const other = await prisma.store.findFirst({
    where: {
      companyId: mgr!.companyId,
      kind: StoreKind.BRANCH,
      id: { not: mgr!.storeId! },
    },
  });
  const c = await login("manager@aromat.plus", "manager1234");

  const wh = await fetch(`${BASE}/api/warehouse/stock`, {
    headers: { Cookie: c },
  });
  const tr = await fetch(`${BASE}/api/transfers`, { headers: { Cookie: c } });
  const nt = await fetch(`${BASE}/api/notifications`, {
    headers: { Cookie: c },
  });
  let transfersLeak = false;
  if (tr.status === 200 && other) {
    const items = (await tr.json()) as Array<{
      toStoreId?: string;
      fromStoreId?: string;
    }>;
    transfersLeak = items.some(
      (t) =>
        t.toStoreId === other.id ||
        (t.fromStoreId && t.fromStoreId === other.id)
    );
  }
  rows.push({
    id: "H1",
    status: wh.status === 200 ? "OPEN" : "CHECK",
    note: `warehouse/stock=${wh.status}; transfers=${tr.status} foreignStoreInList=${transfersLeak}; notifications=${nt.status}. Shared WH may be by design; foreign branch transfers = leak if true.`,
  });

  // H2 — export cost to manager
  const ex = await fetch(`${BASE}/api/export?type=products&format=xlsx`, {
    headers: { Cookie: c },
  });
  let costCol = false;
  if (ex.status === 200) {
    const buf = Buffer.from(await ex.arrayBuffer());
    // crude: look for cost-ish headers in unzipped shared strings is hard; mark OPEN if export allowed
    costCol = buf.length > 100;
  }
  rows.push({
    id: "H2",
    status: ex.status === 200 ? "OPEN" : ex.status === 403 ? "CLOSED" : "CHECK",
    note: `Manager export products status=${ex.status}. Code still emits defaultCostPerUnit for manager-accessible export (see export/route.ts).`,
  });

  // H3 — packaging ?? 1 in UI source
  const packPage = readFileSync(
    join(process.cwd(), "src/app/(owner)/warehouse/packaging/page.tsx"),
    "utf8"
  );
  const inventCost = packPage.includes("?? 1");
  rows.push({
    id: "H3",
    status: inventCost ? "OPEN" : "CLOSED",
    note: inventCost
      ? "packaging/page.tsx still uses ?? 1 fallback for receive cost"
      : "no ?? 1 fallback found",
  });

  // H4 — ensureOwnerDirectStore unused in app runtime
  const appUses = (() => {
    try {
      const { execSync } = require("child_process") as typeof import("child_process");
      const out = execSync(
        `rg -l "ensureOwnerDirectStore" src/app src/components --glob "*.ts*"`,
        { encoding: "utf8" }
      );
      return out.trim().length > 0;
    } catch {
      return false;
    }
  })();
  rows.push({
    id: "H4",
    status: appUses ? "CLOSED" : "OPEN",
    note: appUses
      ? "ensureOwnerDirectStore referenced from app UI"
      : "ensureOwnerDirectStore only in service; no in-app recreate after wipe",
  });

  // H5 — gift rules not applied from GiftRule table in sale.service
  const saleSrc = readFileSync(
    join(process.cwd(), "src/lib/services/sale.service.ts"),
    "utf8"
  );
  const appliesRules = /prisma\.giftRule|GiftRule/.test(saleSrc);
  rows.push({
    id: "H5",
    status: appliesRules ? "CLOSED" : "OPEN",
    note: appliesRules
      ? "sale.service references GiftRule"
      : "sale.service has isGift flag only; GiftRule table not auto-applied in POS",
  });

  console.log(JSON.stringify({ base: BASE, highs: rows }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
