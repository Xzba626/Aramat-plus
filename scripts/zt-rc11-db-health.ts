/**
 * RC11 — Database health: orphans, negatives, empty parents.
 * Run: npx tsx scripts/zt-rc11-db-health.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const checks: Array<{ check: string; status: string; count: number }> = [];

  const negStock = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*)::bigint AS c FROM "StockBalance" WHERE quantity < 0`;
  checks.push({
    check: "negative_stock_balance",
    status: Number(negStock[0]?.c ?? 0) === 0 ? "PASS" : "FAIL",
    count: Number(negStock[0]?.c ?? 0),
  });

  const negBatch = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*)::bigint AS c FROM "Batch" WHERE quantity < 0 OR "initialQuantity" < 0`;
  checks.push({
    check: "negative_batch_qty",
    status: Number(negBatch[0]?.c ?? 0) === 0 ? "PASS" : "FAIL",
    count: Number(negBatch[0]?.c ?? 0),
  });

  const saleNoItems = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*)::bigint AS c FROM "Sale" s
    WHERE NOT EXISTS (SELECT 1 FROM "SaleItem" i WHERE i."saleId" = s.id)`;
  checks.push({
    check: "sale_without_items",
    status: Number(saleNoItems[0]?.c ?? 0) === 0 ? "PASS" : "FAIL",
    count: Number(saleNoItems[0]?.c ?? 0),
  });

  const transferNoItems = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*)::bigint AS c FROM "Transfer" t
    WHERE NOT EXISTS (SELECT 1 FROM "TransferItem" i WHERE i."transferId" = t.id)`;
  checks.push({
    check: "transfer_without_items",
    status: Number(transferNoItems[0]?.c ?? 0) === 0 ? "PASS" : "FAIL",
    count: Number(transferNoItems[0]?.c ?? 0),
  });

  const orphanSaleItems = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*)::bigint AS c FROM "SaleItem" i
    WHERE NOT EXISTS (SELECT 1 FROM "Sale" s WHERE s.id = i."saleId")`;
  checks.push({
    check: "orphan_sale_items",
    status: Number(orphanSaleItems[0]?.c ?? 0) === 0 ? "PASS" : "FAIL",
    count: Number(orphanSaleItems[0]?.c ?? 0),
  });

  const orphanProducts = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*)::bigint AS c FROM "SaleItem" i
    WHERE NOT EXISTS (SELECT 1 FROM "Product" p WHERE p.id = i."productId")`;
  checks.push({
    check: "sale_item_missing_product",
    status: Number(orphanProducts[0]?.c ?? 0) === 0 ? "PASS" : "FAIL",
    count: Number(orphanProducts[0]?.c ?? 0),
  });

  const sellersNoStore = await prisma.user.count({
    where: { role: "SELLER", isActive: true, storeId: null },
  });
  checks.push({
    check: "active_seller_without_store",
    status: sellersNoStore === 0 ? "PASS" : "FAIL",
    count: sellersNoStore,
  });

  // Soft check: managers should have store in store-manager mode
  const mgrNoStore = await prisma.user.count({
    where: { role: "MANAGER", isActive: true, storeId: null },
  });
  checks.push({
    check: "active_manager_without_store",
    status: mgrNoStore === 0 ? "PASS" : "FAIL",
    count: mgrNoStore,
  });

  void Prisma;
  const fail = checks.filter((c) => c.status === "FAIL").length;
  console.log(
    JSON.stringify({ rc11: fail === 0 ? "PASS" : "FAIL", fail, checks }, null, 2)
  );
  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
