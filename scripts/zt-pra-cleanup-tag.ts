import { PrismaClient } from "@prisma/client";

const TAG = process.argv[2] || "PRA_1786000098477";
const p = new PrismaClient();

async function main() {
  const stores = await p.store.findMany({
    where: { name: { startsWith: TAG } },
    select: { id: true },
  });
  const products = await p.product.findMany({
    where: { name: { startsWith: TAG } },
    select: { id: true },
  });
  const pids = products.map((x) => x.id);
  const sids = stores.map((x) => x.id);
  console.log({ tag: TAG, stores: sids.length, products: pids.length });
  if (pids.length) {
    const sales = await p.sale.findMany({
      where: { items: { some: { productId: { in: pids } } } },
      select: { id: true },
    });
    const saleIds = sales.map((s) => s.id);
    if (saleIds.length) {
      await p.saleReturnItem.deleteMany({
        where: { return: { saleId: { in: saleIds } } },
      });
      await p.saleReturn.deleteMany({ where: { saleId: { in: saleIds } } });
      await p.saleItem.deleteMany({ where: { saleId: { in: saleIds } } });
      await p.sale.deleteMany({ where: { id: { in: saleIds } } });
    }
    await p.transferItem.deleteMany({ where: { productId: { in: pids } } });
    if (sids.length) {
      await p.transfer.deleteMany({ where: { toStoreId: { in: sids } } });
      await p.inventorySession.deleteMany({ where: { storeId: { in: sids } } });
    }
    await p.batch.deleteMany({ where: { productId: { in: pids } } });
    await p.stockBalance.deleteMany({ where: { productId: { in: pids } } });
    await p.inventoryItem.deleteMany({ where: { productId: { in: pids } } });
    await p.product.deleteMany({ where: { id: { in: pids } } });
  }
  await p.user.deleteMany({ where: { name: { startsWith: TAG } } });
  if (sids.length) {
    await p.store.deleteMany({ where: { id: { in: sids } } });
  }
  console.log("cleaned");
  await p.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
