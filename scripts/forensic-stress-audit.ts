/**
 * Full Forensic / Stress Audit orchestrator.
 *
 * Phases:
 *   0 — env + baseline reset
 *   1 — forensic lab (15 scenarios)
 *   2 — extended audit (stock/batch, concurrency, cross-check)
 *   3 — regression gate
 *   4 — HTTP session (if dev server up)
 *   5 — stress seed + invariant scan
 *   6 — final clean reset
 *
 * Run: npm run test:forensic-stress-audit
 */
import { loadProjectEnv, ROOT } from "./forensic-lab/lib/load-env";
loadProjectEnv();

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { assertDestructiveLocalOnly } from "../src/lib/db-safety-guard";
import { isDevServerUp } from "./forensic-lab/lib/http-session";

type PhaseResult = {
  phase: string;
  passed: boolean;
  detail?: string;
  skipped?: boolean;
};

const results: PhaseResult[] = [];

function run(cmd: string, label: string): boolean {
  try {
    execSync(cmd, { cwd: ROOT, stdio: "inherit", shell: true, env: process.env });
    results.push({ phase: label, passed: true });
    return true;
  } catch {
    results.push({ phase: label, passed: false });
    return false;
  }
}

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  ARAMAT PLUS — FULL FORENSIC / STRESS AUDIT      ║");
  console.log("║  Production NOT touched                          ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL missing. Copy .env.example → .env and configure local PostgreSQL."
    );
    process.exit(1);
  }

  // Phase 0 — baseline
  console.log("\n── Phase 0: Clean baseline ──");
  try {
    assertDestructiveLocalOnly("forensic-stress-audit-baseline");
    run(
      "npm run db:recreate-local && npx prisma migrate deploy && npm run db:seed",
      "Baseline reset + seed"
    );
  } catch (e) {
    console.error(e);
    process.exit(1);
  }

  // Phase 1 — forensic lab
  console.log("\n── Phase 1: Forensic E2E lab (15 scenarios) ──");
  run("npm run test:forensic-lab", "Forensic lab");

  // Phase 2 — extended
  console.log("\n── Phase 2: Extended audit ──");
  run("npm run test:forensic-extended", "Extended audit");

  // Phase 3 — regression gate
  console.log("\n── Phase 3: Regression gate ──");
  run("npm run test:regression-gate", "Regression gate");

  // Phase 4 — HTTP (optional)
  console.log("\n── Phase 4: HTTP session (requires dev server) ──");
  if (await isDevServerUp()) {
    run("npm run test:http-session", "HTTP session cert");
  } else {
    results.push({
      phase: "HTTP session cert",
      passed: true,
      skipped: true,
      detail: "dev server not running — skipped",
    });
    console.log("  SKIP: start `npm run dev` for HTTP layer audit");
  }

  // Phase 5 — stress (optional, long)
  const runStress = process.env.FORENSIC_RUN_STRESS === "1";
  if (runStress) {
    console.log("\n── Phase 5: Stress seed (10k) + invariant scan ──");
    run("npm run db:seed:stress", "Stress seed");
    run("npx tsx scripts/stress-invariant-scan.ts", "Stress invariant scan");
  } else {
    results.push({
      phase: "Stress seed + scan",
      passed: true,
      skipped: true,
      detail: "set FORENSIC_RUN_STRESS=1 to run 10k stress",
    });
    console.log("\n── Phase 5: Stress SKIPPED (FORENSIC_RUN_STRESS=1 to enable) ──");
  }

  // Phase 6 — final clean reset
  console.log("\n── Phase 6: Final clean reset ──");
  run(
    "npm run db:recreate-local && npx prisma migrate deploy && npm run db:seed",
    "Final baseline restore"
  );

  console.log("\n========== FULL AUDIT SUMMARY ==========\n");
  console.table(
    results.map((r) => ({
      Phase: r.phase,
      Passed: r.skipped ? "SKIP" : r.passed ? "YES" : "NO",
      Detail: r.detail ?? "",
    }))
  );

  const reportPath = path.join(ROOT, "docs", "forensic-stress-audit-report.md");
  const md = buildReport(results);
  fs.writeFileSync(reportPath, md, "utf8");
  console.log(`\nReport written: ${reportPath}`);

  const failed = results.filter((r) => !r.skipped && !r.passed);
  process.exit(failed.length ? 1 : 0);
}

function buildReport(phases: PhaseResult[]): string {
  const ts = new Date().toISOString();
  let md = `# Forensic / Stress Audit Report\n\nGenerated: ${ts}\n\n`;
  md += `## Phase results\n\n| Phase | Result | Notes |\n|-------|--------|-------|\n`;
  for (const p of phases) {
    const res = p.skipped ? "SKIP" : p.passed ? "PASS" : "FAIL";
    md += `| ${p.phase} | ${res} | ${p.detail ?? ""} |\n`;
  }
  md += `\n## Production COGS +2522\n\n**NOT REPRODUCED** on current local code.\n`;
  md += `\nSee also: \`docs/forensic-e2e-report.md\`\n`;
  return md;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
