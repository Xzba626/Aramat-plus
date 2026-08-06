/**
 * Stage-2 preflight: assess whether DB looks like demo/lab vs real production.
 * Does NOT delete anything.
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "node:fs";

const prisma = new PrismaClient();

async function main() {
  const [
    companies,
    stores,
    users,
    products,
    batches,
    sales,
    saleItems,
    transfers,
    expenses,
  ] = await Promise.all([
    prisma.company.count(),
    prisma.store.count(),
    prisma.user.count(),
    prisma.product.count(),
    prisma.batch.count(),
    prisma.sale.count(),
    prisma.saleItem.count(),
    prisma.transfer.count(),
    prisma.expense.count(),
  ]);

  const sampleStores = await prisma.store.findMany({
    take: 12,
    select: { name: true, kind: true, isActive: true },
    orderBy: { createdAt: "desc" },
  });
  const sampleUsers = await prisma.user.findMany({
    take: 15,
    select: {
      email: true,
      role: true,
      name: true,
      storeId: true,
      isActive: true,
    },
  });
  const ztProducts = await prisma.product.count({
    where: { name: { startsWith: "ZT " } },
  });
  const recentSales = await prisma.sale.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    select: { id: true, total: true, createdAt: true, status: true },
  });

  const report = {
    assessedAt: new Date().toISOString(),
    counts: {
      companies,
      stores,
      users,
      products,
      batches,
      sales,
      saleItems,
      transfers,
      expenses,
      ztNamedProducts: ztProducts,
    },
    sampleStores,
    sampleUsers,
    recentSales,
    verdict:
      companies <= 2 &&
      stores < 40 &&
      products < 2000 &&
      saleItems < 50000 &&
      sampleUsers.some((u) => u.email?.includes("aromat.plus"))
        ? "LAB_OR_DEMO_SAFE_FOR_TAGGED_TEST_DATA"
        : "REVIEW_MANUALLY_BEFORE_BULK_LOAD",
  };

  mkdirSync("tmp", { recursive: true });
  writeFileSync(
    "tmp/e2e-stage2-preflight.json",
    JSON.stringify(report, null, 2),
    "utf8"
  );
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
