/**
 * Full ActivityLog coverage report:
 * action → category → severity → storeId / productId / quantity / amount
 *
 *   npx tsx scripts/zt-activity-log-audit.ts
 * Does NOT mutate data.
 */
import { prisma } from "../src/lib/prisma";
import {
  allKnownActions,
  categorizeActivityAction,
  getActivitySeverity,
} from "../src/lib/activity-log-categories";

type Meta = Record<string, unknown> | null;

function asMeta(raw: unknown): Meta {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

function hasKey(meta: Meta, ...keys: string[]): boolean {
  if (!meta) return false;
  return keys.some((k) => {
    const v = meta[k];
    return v != null && String(v).trim() !== "";
  });
}

async function main() {
  const total = await prisma.activityLog.count();
  const byAction = await prisma.activityLog.groupBy({
    by: ["action"],
    _count: { _all: true },
    orderBy: { _count: { action: "desc" } },
  });

  const known = new Set(allKnownActions());
  const recent = await prisma.activityLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 3000,
    select: {
      action: true,
      metadata: true,
      ip: true,
      userAgent: true,
      userId: true,
      createdAt: true,
    },
  });

  type Cov = {
    n: number;
    store: number;
    product: number;
    qty: number;
    amount: number;
    ip: number;
    ua: number;
  };
  const cov = new Map<string, Cov>();
  for (const row of recent) {
    const c = cov.get(row.action) ?? {
      n: 0,
      store: 0,
      product: 0,
      qty: 0,
      amount: 0,
      ip: 0,
      ua: 0,
    };
    c.n += 1;
    const meta = asMeta(row.metadata);
    if (hasKey(meta, "storeId", "toStoreId")) c.store += 1;
    if (hasKey(meta, "productId", "productName", "productNames", "skuName"))
      c.product += 1;
    if (hasKey(meta, "quantity", "qty", "itemCount")) c.qty += 1;
    if (hasKey(meta, "amount", "finalAmount", "originalAmount", "total"))
      c.amount += 1;
    if (row.ip) c.ip += 1;
    if (row.userAgent) c.ua += 1;
    cov.set(row.action, c);
  }

  const pct = (a: number, b: number) =>
    b ? `${Math.round((100 * a) / b)}%` : "—";

  console.log("=== ActivityLog full coverage ===");
  console.log(`Total rows: ${total} · sample: ${recent.length}`);
  console.log("");
  console.log(
    "ACTION".padEnd(28) +
      "CAT".padEnd(12) +
      "SEV".padEnd(10) +
      "N".padStart(5) +
      "  STORE  PRODUCT  QTY  AMOUNT  IP   UA"
  );
  console.log("-".repeat(90));

  for (const row of byAction) {
    const action = row.action;
    const c = cov.get(action);
    const n = c?.n ?? 0;
    console.log(
      action.padEnd(28) +
        categorizeActivityAction(action).padEnd(12) +
        getActivitySeverity(action).padEnd(10) +
        String(row._count._all).padStart(5) +
        "  " +
        pct(c?.store ?? 0, n).padStart(5) +
        "  " +
        pct(c?.product ?? 0, n).padStart(7) +
        "  " +
        pct(c?.qty ?? 0, n).padStart(3) +
        "  " +
        pct(c?.amount ?? 0, n).padStart(6) +
        "  " +
        pct(c?.ip ?? 0, n).padStart(3) +
        "  " +
        pct(c?.ua ?? 0, n).padStart(3)
    );
  }

  const unknown = byAction.filter((r) => !known.has(r.action));
  console.log("");
  console.log("--- Unknown actions ---");
  if (!unknown.length) console.log("(none)");
  else unknown.forEach((u) => console.log(`  ${u.action} × ${u._count._all}`));

  const logins = recent.filter((r) => r.action === "LOGIN");
  const withIpUa = logins.filter((r) => r.ip && r.userAgent);
  console.log("");
  console.log("--- LOGIN persistence check (sample) ---");
  console.log(
    `LOGIN rows in sample: ${logins.length}; with IP+UA: ${withIpUa.length}`
  );
  if (logins.length && withIpUa.length === 0) {
    console.log(
      "WARN: LOGIN rows lack IP/UA — Auth.js request headers may be missing in this environment."
    );
  } else if (logins.length) {
    console.log("OK: login events persist IP and userAgent when available.");
  }

  console.log("");
  console.log("See docs/JOURNAL-INDEXES.md for future indexes (not applied).");
  console.log("Done. No data mutated.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
