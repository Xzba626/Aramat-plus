import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertDestructiveLocalOnly } from "../../../src/lib/db-safety-guard";
import { loadProjectEnv } from "./load-env";

loadProjectEnv();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export function resetLocalDatabase(label = "forensic-lab") {
  assertDestructiveLocalOnly(label);
  const env = {
    ...process.env,
    PGPASSWORD: process.env.PGPASSWORD ?? "aromat",
  };
  console.log(`\n[reset] ${label} — recreate + migrate + seed`);
  execSync("npm run db:recreate-local", {
    cwd: ROOT,
    stdio: "inherit",
    env,
    shell: true,
  });
  execSync("npx prisma migrate deploy", {
    cwd: ROOT,
    stdio: "inherit",
    env,
    shell: true,
  });
  execSync("npm run db:seed", { cwd: ROOT, stdio: "inherit", env, shell: true });
}
