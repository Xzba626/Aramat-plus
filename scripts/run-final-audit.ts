/**
 * Final forensic audit orchestrator — runs all gates sequentially.
 * Run: npm run test:final-audit
 *
 * WARNING: Resets local DB multiple times. Stop `npm run dev` first.
 */
import { spawnSync } from "node:child_process";
import { loadProjectEnv } from "./forensic-lab/lib/load-env";

loadProjectEnv();

type Step = { name: string; cmd: string; args: string[] };

const steps: Step[] = [
  { name: "TypeScript", cmd: "npx", args: ["tsc", "--noEmit"] },
  { name: "Regression gate", cmd: "npm", args: ["run", "test:regression-gate"] },
  { name: "Forensic lab (15)", cmd: "npm", args: ["run", "test:forensic-lab"] },
  { name: "Forensic extended (9)", cmd: "npm", args: ["run", "test:forensic-extended"] },
  { name: "Store period filters", cmd: "npm", args: ["run", "test:store-period-filters"] },
  { name: "Expense integrity", cmd: "npx", args: ["tsx", "scripts/test-expense-integrity.ts"] },
  { name: "Expense date round-trip", cmd: "npx", args: ["tsx", "scripts/test-expense-date-roundtrip.ts"] },
  { name: "i18n expense keys", cmd: "npx", args: ["tsx", "scripts/test-i18n-expense-keys.ts"] },
  { name: "i18n ru/tj parity", cmd: "npx", args: ["tsx", "scripts/test-i18n-parity.ts"] },
  { name: "Product integrity", cmd: "npx", args: ["tsx", "scripts/test-product-integrity.ts"] },
  { name: "Discount integrity", cmd: "npx", args: ["tsx", "scripts/test-discount-integrity.ts"] },
  { name: "Financial integrity scan", cmd: "npm", args: ["run", "test:financial-integrity"] },
  { name: "RBAC", cmd: "npm", args: ["run", "test:rbac"] },
  { name: "Partial return", cmd: "npx", args: ["tsx", "scripts/test-partial-return.ts"] },
  { name: "E2E chain", cmd: "npm", args: ["run", "test:e2e-chain"] },
];

const results: Array<{ name: string; ok: boolean; code: number | null }> = [];

console.log("========== FINAL FORENSIC AUDIT ==========\n");
console.log("Ensure npm run dev is STOPPED (DB will be reset).\n");

for (const step of steps) {
  process.stdout.write(`\n>>> ${step.name}...\n`);
  const r = spawnSync(step.cmd, step.args, {
    stdio: "inherit",
    shell: true,
    cwd: process.cwd(),
    env: process.env,
  });
  const ok = r.status === 0;
  results.push({ name: step.name, ok, code: r.status });
  if (!ok) {
    console.error(`\n[ABORT] ${step.name} failed (exit ${r.status})`);
    break;
  }
}

console.log("\n========== FINAL AUDIT SUMMARY ==========\n");
console.table(
  results.map((r) => ({
    Step: r.name,
    Status: r.ok ? "PASS" : "FAIL",
    Exit: r.code,
  }))
);

const allOk = results.every((r) => r.ok) && results.length === steps.length;
if (!allOk) {
  console.error("\nFinal audit FAILED — fix before commit/deploy.\n");
  process.exit(1);
}
console.log("\nAll audit gates PASSED.\n");
