import { PrismaClient, LocationType, StoreKind } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const wh = await p.warehouse.findFirst();
  const stores = await p.store.findMany({ where: { kind: StoreKind.BRANCH } });
  const whStock = await p.stockBalance.findMany({
    where: { locationType: LocationType.WAREHOUSE, quantity: { gt: 0 } },
    include: { product: true },
  });
  const stStock = await p.stockBalance.findMany({
    where: { locationType: LocationType.STORE, quantity: { gt: 0 } },
    include: { product: true },
  });
  const transfers = await p.transfer.count();
  const sales = await p.sale.count();
  const sellers = await p.user.findMany({
    where: { role: "SELLER" },
    select: { email: true, storeId: true, name: true },
  });

  console.log("--- DIAGNOSTIC ---");
  console.log("Warehouse:", wh?.name, wh?.id);
  console.log(
    "Branches:",
    stores.map((s) => `${s.name} (${s.id})`).join("; ")
  );
  console.log("Warehouse stock rows:", whStock.length);
  for (const b of whStock.slice(0, 10)) {
    console.log(`  WH ${b.product.name}: ${Number(b.quantity)}`);
  }
  console.log("Store stock rows:", stStock.length);
  for (const b of stStock.slice(0, 10)) {
    const store = stores.find((s) => s.id === b.locationId);
    console.log(
      `  STORE ${store?.name ?? b.locationId} · ${b.product.name}: ${Number(b.quantity)}`
    );
  }
  console.log("Transfers count:", transfers);
  console.log("Sales count:", sales);
  console.log("Sellers:", JSON.stringify(sellers));
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
