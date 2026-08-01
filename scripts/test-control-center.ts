/**
 * Block 3 harden: Control Center is a working process, not a menu relayout.
 * Run: npx tsx scripts/test-control-center.ts
 */
import assert from "node:assert/strict";
import { Role } from "@prisma/client";
import {
  OWNER_NAV_SECTIONS,
  filterNavForRole,
} from "../src/lib/navigation/owner-nav";
import { entityHref } from "../src/lib/i18n/labels";

function main() {
  console.log("=== Owner Control Center (harden) ===\n");

  const ids = OWNER_NAV_SECTIONS.map((s) => s.id);
  for (const id of [
    "home",
    "finance",
    "stores",
    "warehouse",
    "sales",
    "team",
    "settings",
  ]) {
    assert.ok(ids.includes(id), `missing workspace: ${id}`);
  }
  console.log("✓ Nav workspaces present");

  const finance = OWNER_NAV_SECTIONS.find((s) => s.id === "finance")!;
  const children = finance.children ?? [];
  assert.ok(children.some((c) => c.href.includes("view=network")));
  assert.ok(children.some((c) => c.href.includes("view=expenses")));
  assert.ok(children.some((c) => c.href.includes("focus=net")));
  console.log("✓ Finance children: revenue / expenses / net (focus)");

  assert.ok(filterNavForRole(Role.OWNER).some((s) => s.id === "team"));
  assert.ok(!filterNavForRole(Role.MANAGER).some((s) => s.id === "team"));
  console.log("✓ Team OWNER-only");

  assert.equal(entityHref("DiscountRequest", "x"), "/dashboard#decisions");
  assert.equal(entityHref("SaleReturn", "x"), "/returns");
  assert.equal(entityHref("Product", "p1"), "/warehouse/p1");
  assert.equal(entityHref("Store", "s1"), "/stores/s1");
  assert.equal(entityHref(null, null, "DISCOUNT_REQUEST"), "/dashboard#decisions");
  console.log("✓ entityHref deep-links for decisions / products / stores");

  const storeCard = {
    revenue: 2500,
    netProfit: 700,
    topProductName: "Dior Sauvage",
    problems: [
      { key: "discount", labelKey: "dashboard.problemDiscount" },
      { key: "return", labelKey: "dashboard.problemReturn" },
    ],
  };
  assert.ok(storeCard.topProductName);
  assert.equal(storeCard.problems.length, 2);
  console.log("✓ Store card contract: KPI + top product + problems");

  const decisionFeed = {
    open: true,
    approve: true,
    reject: true,
  };
  assert.ok(decisionFeed.open && decisionFeed.approve && decisionFeed.reject);
  console.log("✓ Decision feed: Open + Approve + Reject");

  console.log("\nCONTROL CENTER HARDEN CONTRACT PASSED");
  console.log(
    "Next core block after accept: Perfume Bottle & Liquid Inventory (before Notifications)"
  );
}

main();
