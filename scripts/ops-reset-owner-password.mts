/**
 * Ops recovery: set a simple OWNER password for owner@aromat.plus (raw SQL).
 *   npx tsx scripts/ops-reset-owner-password.mts
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Explicit password for recovery; change after login. */
const RECOVERY_PASSWORD = process.env.OPS_OWNER_PASSWORD || "OwnerTemp2026!";

async function main() {
  const owners = await prisma.$queryRaw<
    Array<{ id: string; email: string }>
  >`
    SELECT id, email
    FROM "User"
    WHERE email = 'owner@aromat.plus' AND role = 'OWNER'
    LIMIT 1
  `;
  const owner = owners[0];
  if (!owner) {
    console.error("NO_OWNER_FOUND for owner@aromat.plus");
    process.exit(1);
  }

  const hash = await bcrypt.hash(RECOVERY_PASSWORD, 12);
  await prisma.$executeRaw`
    UPDATE "User"
    SET
      "passwordHash" = ${hash},
      "failedLoginCount" = 0,
      "lockedUntil" = NULL,
      "isActive" = true,
      "updatedAt" = NOW()
    WHERE id = ${owner.id}
  `;

  const ok = await bcrypt.compare(
    RECOVERY_PASSWORD,
    (
      await prisma.$queryRaw<Array<{ passwordHash: string }>>`
        SELECT "passwordHash" FROM "User" WHERE id = ${owner.id}
      `
    )[0]!.passwordHash
  );

  console.log("UPDATED");
  console.log(`EMAIL=${owner.email}`);
  console.log(`PASSWORD=${RECOVERY_PASSWORD}`);
  console.log(`VERIFY_COMPARE=${ok}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
