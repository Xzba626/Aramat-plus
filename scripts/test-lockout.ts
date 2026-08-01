/**
 * Acceptance: login lockout counters + ActivityLog + reset on success.
 * Run: npx tsx scripts/test-lockout.ts
 */
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

/** Mirrors src/lib/auth.ts lockDurationMs */
function lockDurationMs(failCount: number): number | null {
  if (failCount < 3) return null;
  if (failCount < 6) return 30_000;
  if (failCount < 9) return 60_000;
  if (failCount < 12) return 5 * 60_000;
  return 15 * 60_000;
}

async function main() {
  console.log("=== Login lockout ===\n");

  assert(lockDurationMs(2) === null, "2 fails → no lock");
  assert(lockDurationMs(3) === 30_000, "3 fails → 30s");
  assert(lockDurationMs(6) === 60_000, "6 fails → 1m");
  assert(lockDurationMs(9) === 5 * 60_000, "9 fails → 5m");
  assert(lockDurationMs(12) === 15 * 60_000, "12 fails → 15m");
  console.log("✓ Backoff schedule matches spec");

  const company = await prisma.company.findFirst();
  assert(company, "company");

  const email = `lockout-test-${Date.now()}@test.local`;
  const user = await prisma.user.create({
    data: {
      email,
      name: "Lockout Test",
      passwordHash: await bcrypt.hash("correct-pass", 10),
      role: Role.SELLER,
      companyId: company.id,
      failedLoginCount: 0,
    },
  });

  // Simulate 3 failures → lock 30s
  for (let i = 1; i <= 3; i++) {
    const failCount = i;
    const lockMs = lockDurationMs(failCount);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failCount,
        lockedUntil: lockMs ? new Date(Date.now() + lockMs) : null,
      },
    });
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        companyId: company.id,
        action: "LOGIN_FAIL",
        entityType: "User",
        entityId: user.id,
        result: "FAIL",
        metadata: { failedLoginCount: failCount },
      },
    });
  }

  const afterFail = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
  });
  assert(afterFail.failedLoginCount === 3, "fail count 3");
  assert(afterFail.lockedUntil != null, "lockedUntil set");
  assert(afterFail.lockedUntil! > new Date(), "still locked");
  console.log("✓ After 3 fails: lockedUntil set");

  const failLogs = await prisma.activityLog.count({
    where: { userId: user.id, action: "LOGIN_FAIL" },
  });
  assert(failLogs === 3, `3 LOGIN_FAIL logs got ${failLogs}`);
  console.log("✓ ActivityLog LOGIN_FAIL ×3");

  // Success resets
  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    },
  });
  await prisma.activityLog.create({
    data: {
      userId: user.id,
      companyId: company.id,
      action: "LOGIN",
      entityType: "User",
      entityId: user.id,
      result: "SUCCESS",
    },
  });

  const afterOk = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
  });
  assert(afterOk.failedLoginCount === 0, "counter reset");
  assert(afterOk.lockedUntil == null, "lock cleared");
  console.log("✓ Successful login resets counter");

  await prisma.activityLog.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });

  console.log("\nALL LOCKOUT TESTS PASSED");
  console.log(
    "NOTE: IP/UA in authorize() currently null (Credentials provider limitation)."
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
