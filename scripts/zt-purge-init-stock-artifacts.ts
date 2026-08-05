import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const names = await prisma.product.findMany({
    where: { name: { startsWith: "ZT Init" } },
    select: { id: true, name: true },
  });
  console.log("leftover products", names.length);
  const ids = names.map((x) => x.id);
  if (ids.length) {
    await prisma.notification.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.transferItem.deleteMany({ where: { productId: { in: ids } } });
    const tr = await prisma.transfer.findMany({
      where: { items: { some: { productId: { in: ids } } } },
      select: { id: true },
    });
    await prisma.stockBalance.deleteMany({ where: { productId: { in: ids } } });
    await prisma.batch.deleteMany({ where: { productId: { in: ids } } });
    await prisma.activityLog.deleteMany({
      where: {
        OR: [
          { entityId: { in: ids } },
          { entityId: { in: tr.map((t) => t.id) } },
        ],
      },
    });
    await prisma.transfer.deleteMany({
      where: { id: { in: tr.map((t) => t.id) } },
    });
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
    console.log("purged products", ids.length);
  }
  const ztStores = await prisma.store.findMany({
    where: { name: { startsWith: "ZT Init Store" } },
    select: { id: true },
  });
  const storeIds = ztStores.map((s) => s.id);
  if (storeIds.length) {
    const tr = await prisma.transfer.findMany({
      where: {
        OR: [
          { toStoreId: { in: storeIds } },
          { fromStoreId: { in: storeIds } },
        ],
      },
      select: { id: true },
    });
    const transferIds = tr.map((t) => t.id);
    if (transferIds.length) {
      await prisma.transferItem.deleteMany({
        where: { transferId: { in: transferIds } },
      });
      await prisma.activityLog.deleteMany({
        where: { entityId: { in: transferIds } },
      });
      await prisma.transfer.deleteMany({
        where: { id: { in: transferIds } },
      });
    }
    const stores = await prisma.store.deleteMany({
      where: { id: { in: storeIds } },
    });
    console.log("purged stores", stores.count);
  } else {
    console.log("purged stores", 0);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
