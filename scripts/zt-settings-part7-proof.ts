/**
 * Part 7: Settings IA — no nested Settings, no categories/expense-types in refs,
 * notifications top-level, expense mutations OWNER-only.
 * Run: npx tsx scripts/zt-settings-part7-proof.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Role } from "@prisma/client";
import {
  OWNER_NAV_SECTIONS,
  filterNavForRole,
  isPathActive,
  sectionForPath,
} from "../src/lib/navigation/owner-nav";

function main() {
  console.log("=== ZT Settings Part 7 proof ===\n");

  const settings = OWNER_NAV_SECTIONS.find((s) => s.id === "settings");
  assert.ok(settings);
  assert.equal(settings.labelKey, "nav.settingsWorkspace");

  const childHrefs = (settings.children ?? []).map((c) => c.href);
  assert.ok(
    !childHrefs.includes("/settings"),
    "settings must not nest a self-link (Settings → Settings)"
  );
  assert.ok(childHrefs.includes("/settings/company"));
  assert.ok(childHrefs.includes("/settings/password"));
  assert.ok(!childHrefs.some((h) => h.includes("notifications")));
  assert.ok(!childHrefs.some((h) => h.includes("categories")));
  console.log("✓ settings children: company + password (+ wipe), no self/notifications/categories");

  assert.equal(
    isPathActive("/settings/company", "/settings"),
    false,
    "/settings must be exact — not prefix of /settings/*"
  );
  assert.equal(isPathActive("/settings", "/settings"), true);
  console.log("✓ isPathActive(/settings) is exact-only");

  const notifs = OWNER_NAV_SECTIONS.find((s) => s.id === "notifications");
  assert.ok(notifs);
  assert.equal(notifs.href, "/notifications");
  assert.equal(sectionForPath("/notifications")?.id, "notifications");
  assert.equal(sectionForPath("/settings")?.id, "settings");
  assert.equal(sectionForPath("/settings/company")?.id, "settings");
  console.log("✓ notifications is top-level section, not under settings");

  const ownerNav = filterNavForRole(Role.OWNER);
  assert.ok(ownerNav.some((s) => s.id === "notifications"));
  const ownerSettings = ownerNav.find((s) => s.id === "settings");
  assert.ok(ownerSettings?.children?.some((c) => c.href === "/settings/wipe"));

  const managerNav = filterNavForRole(Role.MANAGER);
  const mgrSettings = managerNav.find((s) => s.id === "settings");
  assert.ok(
    !mgrSettings?.children?.some((c) => c.href === "/settings/wipe"),
    "wipe is OWNER-only in nav"
  );
  console.log("✓ wipe child OWNER-only");

  const refsSrc = readFileSync(
    join(process.cwd(), "src/app/(owner)/settings/references/page.tsx"),
    "utf8"
  );
  assert.ok(
    !refsSrc.includes("/api/expense-types"),
    "references must not CRUD expense types"
  );
  assert.ok(
    !refsSrc.includes("/api/categories") && !refsSrc.includes("product-types"),
    "references must not manage categories/product-types"
  );
  console.log("✓ references page has no expense-types / categories CRUD");

  const settingsSrc = readFileSync(
    join(process.cwd(), "src/app/(owner)/settings/page.tsx"),
    "utf8"
  );
  assert.ok(
    !settingsSrc.includes('href: "/notifications"'),
    "settings hub must not list notifications card"
  );
  console.log("✓ settings hub has no notifications card");

  const expenseTypesRoute = readFileSync(
    join(process.cwd(), "src/app/api/expense-types/route.ts"),
    "utf8"
  );
  assert.ok(
    /export async function POST[\s\S]*?requireOwner\(user\)/.test(expenseTypesRoute),
    "POST expense-types must requireOwner"
  );
  const expensesRoute = readFileSync(
    join(process.cwd(), "src/app/api/expenses/route.ts"),
    "utf8"
  );
  assert.ok(
    /export async function POST[\s\S]*?requireOwner\(user\)/.test(expensesRoute),
    "POST expenses must requireOwner"
  );
  console.log("✓ expense + expense-type mutations are OWNER-only");

  console.log("\nPASS — Part 7 settings IA");
}

main();
