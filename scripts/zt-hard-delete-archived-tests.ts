/**
 * Hard-delete leftover [ARCHIVED TEST] products after soft purge.
 * Run: npx tsx scripts/zt-hard-delete-archived-tests.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.product.findMany({
    where: {
      OR: [
        { name: { startsWith: "[ARCHIVED TEST]" } },
        { name: { startsWith: "ZT" } },
        { name: "100 мл" },
      ],
    },
    select: { id: true, name: true },
  });
  console.log("targets", rows);

  for (const row of rows) {
    const id = row.id;
    await prisma.inventoryItem.deleteMany({ where: { productId: id } });
    await prisma.reservationItem.deleteMany({ where: { productId: id } });
    await prisma.stockBalance.deleteMany({ where: { productId: id } });
    await prisma.batch.deleteMany({ where: { productId: id } });
    await prisma.transferItem.deleteMany({ where: { productId: id } });
    await prisma.priceHistory.deleteMany({ where: { productId: id } });
    await prisma.costHistory.deleteMany({ where: { productId: id } });
    // Sale items / gift rules may block — null out packaging refs then delete sale items if test-only
    await prisma.saleItem
      .updateMany({
        where: { packagingProductId: id },
        data: { packagingProductId: null },
      })
      .catch(() => undefined);
    await prisma.saleItem.deleteMany({ where: { productId: id } });
    await prisma.giftRule.deleteMany({
      where: { OR: [{ productId: id }, { giftProductId: id }] },
    }).catch(() => undefined);

    try {
      await prisma.product.delete({ where: { id } });
      console.log("deleted", id, row.name);
    } catch (e) {
      console.error("still blocked", id, e);
    }
  }

  const left = await prisma.product.findMany({
    where: {
      OR: [
        { name: { startsWith: "[ARCHIVED TEST]" } },
        { name: { startsWith: "ZT" } },
        { name: "100 мл" },
      ],
    },
    select: { id: true, name: true, isActive: true },
  });
  console.log("remaining", left);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
