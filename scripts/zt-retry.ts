/**
 * Retry wrapper for flaky Neon P1001 during ZT proofs.
 * Usage: npx tsx scripts/zt-retry.ts scripts/zt-return-proof.ts
 */
import { spawn } from "node:child_process";

const script = process.argv[2];
const max = Number(process.argv[3] ?? 4);
if (!script) {
  console.error("Usage: tsx scripts/zt-retry.ts <script> [maxAttempts]");
  process.exit(2);
}

async function once(): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("npx", ["tsx", script], {
      stdio: "inherit",
      shell: true,
      cwd: process.cwd(),
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function main() {
  for (let i = 1; i <= max; i++) {
    console.log(`\n--- attempt ${i}/${max}: ${script} ---`);
    const code = await once();
    if (code === 0) process.exit(0);
    if (i < max) {
      const wait = 3000 * i;
      console.log(`retry after ${wait}ms (Neon flaky?)`);
      await new Promise((r) => setTimeout(r, wait));
    } else {
      process.exit(code);
    }
  }
}

main();
