/**
 * Commercial cert: CRM wipe KEEP/WIPE contract (destructive — re-seeds after).
 * Run: npx tsx scripts/test-crm-wipe-cert.ts
 */
import { PrismaClient, Role, StoreKind } from "@prisma/client";
import { wipeCompanyOperationalData } from "../src/lib/services/crm-wipe.service";
import { execSync } from "node:child_process";

const prisma = new PrismaClient();

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function main() {
  console.log("=== CERT: CRM Wipe ===\n");

  const company = await prisma.company.findFirst();
  assert(company, "company");
  const owner = await prisma.user.findFirst({
    where: {
      companyId: company.id,
      role: Role.OWNER,
      email: "owner@aromat.plus",
    },
  });
  assert(owner, "seed owner");

  const beforeProducts = await prisma.product.count({
    where: { companyId: company.id },
  });

  await wipeCompanyOperationalData({
    companyId: company.id,
    ownerId: owner.id,
    ownerPassword: "owner1234",
    confirmPhrase: "WIPE",
  });

  const afterProducts = await prisma.product.count({
    where: { companyId: company.id },
  });
  const afterSales = await prisma.sale.count();
  const afterBranches = await prisma.store.count({
    where: { companyId: company.id, kind: StoreKind.BRANCH },
  });
  const afterOwner = await prisma.user.findFirst({ where: { id: owner.id } });
  const afterCompany = await prisma.company.findUnique({
    where: { id: company.id },
  });
  const afterSellers = await prisma.user.count({
    where: { companyId: company.id, role: Role.SELLER },
  });
  const ownerDirect = await prisma.store.findFirst({
    where: { companyId: company.id, kind: StoreKind.OWNER_DIRECT },
  });
  const warehouse = await prisma.warehouse.findFirst({
    where: { companyId: company.id },
  });
  const units = await prisma.unit.count({ where: { companyId: company.id } });
  const journal = await prisma.activityLog.count({
    where: { companyId: company.id },
  });

  assert(afterProducts === 0, `products wiped (was ${beforeProducts})`);
  assert(afterSales === 0, "sales wiped");
  assert(afterBranches === 0, "BRANCH wiped");
  assert(afterSellers === 0, "non-owner users wiped");
  assert(afterOwner, "owner kept");
  assert(afterCompany, "company kept");
  assert(ownerDirect, "OWNER_DIRECT kept/recreated");
  assert(warehouse, "warehouse kept/recreated");
  assert(units > 0, "reference units kept");
  // CRM_WIPE log may exist after wipe
  console.log(`activityLog after wipe: ${journal}`);

  console.log("WIPE CONTRACT OK — re-seeding…");
  execSync("npm run db:seed", { stdio: "inherit", cwd: process.cwd() });
  console.log("PASS: CRM wipe + re-seed");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
