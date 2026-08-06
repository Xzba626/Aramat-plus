/**
 * Cleanup leftover E2E2_* tagged products/stores/users from aborted runs.
 * Safe: only deletes rows whose name/email contains E2E2_.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({
    where: { name: { startsWith: "E2E2_" } },
    select: { id: true, name: true },
  });
  const ids = products.map((p) => p.id);
  console.log("E2E2 products:", ids.length);

  if (ids.length) {
    await prisma.saleItem.deleteMany({ where: { productId: { in: ids } } });
    const sales = await prisma.sale.findMany({
      where: { items: { some: { productId: { in: ids } } } },
      select: { id: true },
    });
    await prisma.sale.deleteMany({
      where: { id: { in: sales.map((s) => s.id) } },
    });
    const sessions = await prisma.inventorySession.findMany({
      where: { comment: { startsWith: "E2E2_" } },
      select: { id: true },
    });
    await prisma.inventoryItem.deleteMany({
      where: { sessionId: { in: sessions.map((s) => s.id) } },
    });
    await prisma.inventorySession.deleteMany({
      where: { id: { in: sessions.map((s) => s.id) } },
    });
    const tr = await prisma.transfer.findMany({
      where: { items: { some: { productId: { in: ids } } } },
      select: { id: true },
    });
    await prisma.transferItem.deleteMany({
      where: { productId: { in: ids } },
    });
    await prisma.transfer.deleteMany({
      where: { id: { in: tr.map((t) => t.id) } },
    });
    await prisma.stockBalance.deleteMany({ where: { productId: { in: ids } } });
    await prisma.batch.deleteMany({ where: { productId: { in: ids } } });
    await prisma.activityLog.deleteMany({
      where: { entityId: { in: [...ids, ...sales.map((s) => s.id), ...tr.map((t) => t.id)] } },
    });
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
  }

  const users = await prisma.user.deleteMany({
    where: { email: { contains: "@e2e.local" } },
  });
  const stores = await prisma.store.deleteMany({
    where: { name: { startsWith: "E2E2_" } },
  });
  console.log("deleted users", users.count, "stores", stores.count);
  console.log("CLEANUP_OK");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
