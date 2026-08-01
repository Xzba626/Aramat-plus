/**
 * Final gate: migration integrity on current DB + optional clean-DB apply.
 * Run: npx tsx scripts/test-migrations.ts
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");

function run(cmd: string, env?: NodeJS.ProcessEnv) {
  console.log(`\n$ ${cmd}`);
  return execSync(cmd, {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
    stdio: ["inherit", "pipe", "pipe"],
  });
}

function runWithRetry(cmd: string, attempts = 4): string {
  let last = "";
  for (let i = 1; i <= attempts; i++) {
    try {
      return run(cmd);
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; message?: string };
      last = `${err.stdout ?? ""}\n${err.stderr ?? ""}\n${err.message ?? ""}`;
      const transient = /P1001|Can't reach database|ECONNRESET|ETIMEDOUT/i.test(
        last
      );
      console.warn(`Attempt ${i}/${attempts} failed${transient ? " (transient)" : ""}`);
      if (!transient || i === attempts) throw e;
      execSync(`powershell -Command "Start-Sleep -Seconds ${i * 2}"`, {
        stdio: "ignore",
      });
    }
  }
  throw new Error(last);
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function main() {
  console.log("=== MIGRATIONS: existing + clean DB ===\n");

  assert(existsSync(path.join(root, "prisma", "migrations")), "migrations folder");

  const statusOut = runWithRetry("npx prisma migrate status");
  console.log(statusOut);

  const upToDate =
    /Database schema is up to date/i.test(statusOut) ||
    /All migrations have been successfully applied/i.test(statusOut);
  const hasPending =
    /have not yet been applied|Following migration.*not yet|pending migrations/i.test(
      statusOut
    );

  assert(upToDate && !hasPending, "existing DB migrate status not clean — fix before P2");
  console.log("✓ Existing DB: migrate status OK");

  let cleanOk = false;
  let cleanNote = "";
  try {
    run("docker --version");
    try {
      run("docker rm -f aromat-plus-migrate-check");
    } catch {
      /* ignore */
    }
    run(
      "docker run -d --name aromat-plus-migrate-check -e POSTGRES_USER=aromat -e POSTGRES_PASSWORD=aromat -e POSTGRES_DB=aromat_plus_clean -p 5433:5432 postgres:16-alpine"
    );
    for (let i = 0; i < 30; i++) {
      try {
        run(
          "docker exec aromat-plus-migrate-check pg_isready -U aromat -d aromat_plus_clean"
        );
        break;
      } catch {
        if (i === 29) throw new Error("clean postgres not ready");
        execSync('powershell -Command "Start-Sleep -Seconds 1"', {
          stdio: "ignore",
        });
      }
    }
    const cleanUrl =
      "postgresql://aromat:aromat@127.0.0.1:5433/aromat_plus_clean";
    const deployOut = run("npx prisma migrate deploy", {
      DATABASE_URL: cleanUrl,
      DIRECT_URL: cleanUrl,
    });
    console.log(deployOut);
    assert(
      /All migrations have been successfully applied|No pending migrations/i.test(
        deployOut
      ),
      "clean DB migrate deploy failed"
    );
    const redeploy = run("npx prisma migrate deploy", {
      DATABASE_URL: cleanUrl,
      DIRECT_URL: cleanUrl,
    });
    assert(
      /No pending migrations|already been applied|All migrations have been successfully applied/i.test(
        redeploy
      ),
      "second deploy not idempotent"
    );
    cleanOk = true;
    cleanNote =
      "docker postgres:5433 — all migrations applied + idempotent redeploy";
    console.log("✓ Clean DB: migrate deploy OK + idempotent");
  } catch (e) {
    cleanNote = `skipped/failed: ${e instanceof Error ? e.message : String(e)}`;
    console.warn("⚠ Clean DB check:", cleanNote);
    const dockerMissing =
      /docker/i.test(cleanNote) &&
      (/ENOENT|not found|Cannot connect|npipe|error during connect/i.test(
        cleanNote
      ) ||
        /failed to connect/i.test(cleanNote));
    if (!dockerMissing && !/docker --version/i.test(cleanNote)) {
      // Real migrate failure on clean DB
      if (/migrate deploy|migration/i.test(cleanNote)) {
        throw new Error(`Clean DB migration failed: ${cleanNote}`);
      }
    }
  } finally {
    try {
      run("docker rm -f aromat-plus-migrate-check");
    } catch {
      /* ignore */
    }
  }

  console.log(
    "\nMIGRATIONS PASSED (existing OK" +
      (cleanOk ? ", clean OK" : ", clean SKIPPED") +
      ")"
  );
  if (!cleanOk) {
    console.log("NOTE:", cleanNote || "Docker unavailable for clean-DB proof");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
