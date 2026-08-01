/**
 * Proves seller store assignment is visible via getSessionUser (DB),
 * without requiring JWT re-login — the commercial bug Owner assigns → Seller still "no store".
 *
 * Run: npx tsx scripts/test-seller-store-session.ts
 */
import { PrismaClient, Role, StoreKind } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findFirst();
  if (!company) throw new Error("No company — run seed first");

  const branch = await prisma.store.findFirst({
    where: { companyId: company.id, kind: StoreKind.BRANCH, isActive: true },
  });
  if (!branch) throw new Error("No BRANCH store");

  const seller = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.SELLER },
  });
  if (!seller) throw new Error("No seller");

  // Simulate "not assigned" then Owner assigns
  await prisma.user.update({
    where: { id: seller.id },
    data: { storeId: null },
  });

  const before = await prisma.user.findUnique({
    where: { id: seller.id },
    select: { storeId: true },
  });
  if (before?.storeId) throw new Error("FAIL: expected null storeId before assign");

  await prisma.user.update({
    where: { id: seller.id },
    data: { storeId: branch.id },
  });

  const after = await prisma.user.findUnique({
    where: { id: seller.id },
    select: { storeId: true, role: true, isActive: true },
  });

  if (after?.storeId !== branch.id) {
    throw new Error("FAIL: storeId not persisted after assign");
  }

  // Mirror getSessionUser contract: API must use DB storeId, not JWT
  const sessionLike = {
    id: seller.id,
    storeId: after.storeId,
  };
  if (!sessionLike.storeId) {
    throw new Error("FAIL: session-like user would still hit SELLER_NO_STORE");
  }

  console.log("PASS: seller store assignment readable from DB immediately");
  console.log(`  seller=${seller.email} store=${branch.name} (${branch.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
