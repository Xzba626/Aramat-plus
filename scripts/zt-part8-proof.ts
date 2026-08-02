/**
 * Part 8: Reports top-level + mobile shell = hamburger only (no bottom nav).
 * Run: npx tsx scripts/zt-settings-part8-proof.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  OWNER_NAV_SECTIONS,
  sectionForPath,
} from "../src/lib/navigation/owner-nav";

function main() {
  console.log("=== ZT Part 8 proof (reports IA + mobile shell) ===\n");

  const reports = OWNER_NAV_SECTIONS.find((s) => s.id === "reports");
  assert.ok(reports, "reports section exists");
  assert.equal(reports.href, "/reports");
  assert.equal(reports.labelKey, "nav.reports");

  const finance = OWNER_NAV_SECTIONS.find((s) => s.id === "finance");
  assert.ok(finance);
  assert.ok(
    !(finance.children ?? []).some((c) => c.href === "/reports"),
    "reports must not nest under finance"
  );
  assert.equal(sectionForPath("/reports")?.id, "reports");
  console.log("✓ Отчёты — top-level, not under Finance/Settings/Warehouse");

  const shell = readFileSync(
    join(process.cwd(), "src/components/layout/owner-shell.tsx"),
    "utf8"
  );
  assert.ok(
    !shell.includes("OwnerBottomNav"),
    "owner shell must not render mobile bottom nav"
  );
  assert.ok(shell.includes("onMenu"), "hamburger toggle retained");
  console.log("✓ Owner shell: no bottom nav; hamburger toggles sidebar");

  const morePage = readFileSync(
    join(process.cwd(), "src/app/(owner)/more/page.tsx"),
    "utf8"
  );
  assert.ok(
    morePage.includes('redirect("/dashboard")'),
    "/more redirects — no separate mobile hub"
  );
  console.log("✓ /more redirects to dashboard (no reduced mobile hub)");

  const topbar = readFileSync(
    join(process.cwd(), "src/components/layout/owner-top-bar.tsx"),
    "utf8"
  );
  assert.ok(topbar.includes("Menu"), "hamburger Menu icon present");
  assert.ok(topbar.includes("lg:hidden"), "hamburger visible on small screens");
  console.log("✓ Top bar hamburger for small viewports");

  console.log("\nPASS — Part 8 IA + mobile shell");
  console.log(
    "NOTE: full Excel/PDF daily P&L + piece/weight/ml breakdown = PARTIAL (low priority deferred)"
  );
}

main();
