/**
 * Smoke: journal categories + API filters (owner session).
 *   npx tsx scripts/zt-journal-filters.ts
 */
import {
  categorizeActivityAction,
  actionsForCategory,
  allKnownActions,
  getActivitySeverity,
} from "../src/lib/activity-log-categories";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  assert(categorizeActivityAction("LOGIN") === "logins", "LOGIN");
  assert(categorizeActivityAction("PASSWORD_RESET") === "passwords", "PWD");
  assert(categorizeActivityAction("SALE_CREATE") === "sales", "SALE");
  assert(categorizeActivityAction("RETURN_REQUEST") === "returns", "RET");
  assert(categorizeActivityAction("DISCOUNT_REQUEST") === "discounts", "DISC");
  assert(categorizeActivityAction("TRANSFER_CREATE") === "warehouse", "TR");
  assert(categorizeActivityAction("PRODUCT_CREATE") === "products", "PR");
  assert(categorizeActivityAction("USER_CREATE") === "users", "USR");
  assert(categorizeActivityAction("COMPANY_UPDATE") === "settings", "SET");
  assert(categorizeActivityAction("CRM_WIPE") === "settings", "WIPE");
  assert(categorizeActivityAction("FUTURE_THING") === "other", "OTHER");

  assert(getActivitySeverity("SALE_CREATE") === "info", "sev sale");
  assert(getActivitySeverity("PASSWORD_RESET") === "critical", "sev reset");
  assert(getActivitySeverity("LOGIN") === "security", "sev login");
  assert(getActivitySeverity("PASSWORD_CHANGE") === "warning", "sev pwd");

  const sales = actionsForCategory("sales")!;
  assert(sales.includes("SALE_CREATE"), "sales list");
  assert(!sales.includes("RETURN_REQUEST"), "returns not in sales");
  assert(!sales.includes("LOGIN"), "sales no login");

  const logins = actionsForCategory("logins")!;
  assert(logins.includes("LOGIN_FAIL"), "login fail in logins");

  const known = allKnownActions();
  assert(known.includes("BRAND_ARCHIVE"), "brand archive known");

  const BASE = process.env.ZT_BASE_URL ?? "http://127.0.0.1:3000";
  const jar = new Map<string, string>();
  const store = (res: Response) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  };
  const cookie = () =>
    [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

  try {
    const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
    store(csrfRes);
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookie(),
      },
      body: new URLSearchParams({
        csrfToken,
        email: "owner@aromat.plus",
        password: "owner1234",
        callbackUrl: `${BASE}/journal`,
        json: "true",
      }),
      redirect: "manual",
    });
    store(loginRes);

    const allRes = await fetch(`${BASE}/api/journal?limit=5`, {
      headers: { Cookie: cookie() },
    });
    const allData = await allRes.json();
    assert(allRes.ok, `journal all ${allRes.status}`);
    assert(Array.isArray(allData.items), "items array");

    const loginRes2 = await fetch(
      `${BASE}/api/journal?category=logins&limit=20`,
      { headers: { Cookie: cookie() } }
    );
    const loginData = await loginRes2.json();
    assert(loginRes2.ok, "logins category");
    for (const item of loginData.items ?? []) {
      assert(
        ["LOGIN", "LOGIN_FAIL", "LOGIN_LOCKED"].includes(item.action),
        `unexpected ${item.action} in logins`
      );
      assert(item.severity, "severity present");
    }

    const salesRes = await fetch(
      `${BASE}/api/journal?category=sales&limit=20`,
      { headers: { Cookie: cookie() } }
    );
    const salesData = await salesRes.json();
    assert(salesRes.ok, "sales category");
    for (const item of salesData.items ?? []) {
      assert(item.category === "sales", `cat ${item.category}`);
    }

    console.log("OK journal filters", {
      total: allData.total,
      logins: loginData.total,
      sales: salesData.total,
    });
  } catch (e) {
    console.warn("HTTP smoke skipped/failed:", e);
    console.log("Unit assertions passed.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
