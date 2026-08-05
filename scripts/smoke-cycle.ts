/**
 * One foundation smoke: receive → transfer → sale → assert DB.
 * Run: npm run smoke:cycle
 */
import {
  PrismaClient,
  LocationType,
  AccountingType,
  Role,
  StoreKind,
} from "@prisma/client";
import { addBatch, getQtyAtLocation } from "../src/lib/services/stock.service";
import { createTransfer } from "../src/lib/services/transfer.service";
import { createSale } from "../src/lib/services/sale.service";
import { getPosCatalog } from "../src/lib/services/pos-catalog.service";

const prisma = new PrismaClient();

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function main() {
  console.log("=== SMOKE: Warehouse → Store → POS → Sale ===\n");

  const company = await prisma.company.findFirst();
  assert(company, "company");
  const warehouse = await prisma.warehouse.findFirst({
    where: { companyId: company.id, isActive: true },
  });
  assert(warehouse, "warehouse");
  const store = await prisma.store.findFirst({
    where: { companyId: company.id, kind: StoreKind.BRANCH, isActive: true },
    orderBy: { name: "asc" },
  });
  assert(store, "active branch");
  const owner = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.OWNER, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  assert(owner, "owner");
  let seller = await prisma.user.findFirst({
    where: {
      companyId: company.id,
      role: Role.SELLER,
      storeId: store.id,
      isActive: true,
    },
  });
  if (!seller) {
    seller = await prisma.user.findFirst({
      where: { companyId: company.id, role: Role.SELLER, isActive: true },
    });
    assert(seller, "seller exists");
    await prisma.user.update({
      where: { id: seller.id },
      data: { storeId: store.id },
    });
    console.log(`0. Bound seller ${seller.email} → ${store.name} for smoke`);
  }

  const product = await prisma.product.create({
    data: {
      name: `Smoke Dior ${Date.now()}`,
      companyId: company.id,
      accountingType: AccountingType.PIECE,
      salePrice: 150,
      minStock: 3,
    },
  });

  await prisma.$transaction(
    async (tx) => {
      await addBatch(tx, {
        productId: product.id,
        locationType: LocationType.WAREHOUSE,
        locationId: warehouse.id,
        quantity: 100,
        costPerUnit: 80,
      salePrice: 100,
        notes: "smoke-receive",
      });
    },
    { maxWait: 15_000, timeout: 60_000 }
  );
  console.log("1. Owner receive 100 → warehouse OK");

  await createTransfer({
    companyId: company.id,
    fromWarehouseId: warehouse.id,
    toStoreId: store.id,
    createdById: owner.id,
    items: [{ productId: product.id, quantity: 20 }],
  });
  console.log("2. Owner transfer 20 → store OK");

  const catalog = await getPosCatalog({
    companyId: company.id,
    storeId: store.id,
    q: product.name,
  });
  const posItem = catalog.items.find((i) => i.productId === product.id);
  assert(posItem, "POS catalog contains product");
  assert(posItem.quantity === 20, `POS qty 20, got ${posItem.quantity}`);
  console.log("3. Seller POS sees qty 20 OK");

  await createSale({
    companyId: company.id,
    storeId: store.id,
    sellerId: seller.id,
    items: [{ productId: product.id, quantity: 1 }],
  });
  console.log("4. Seller sale 1 OK");

  const wh = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.WAREHOUSE,
    locationId: warehouse.id,
  });
  const st = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: store.id,
  });
  assert(wh === 80, `warehouse 80, got ${wh}`);
  assert(st === 19, `store 19, got ${st}`);
  console.log("5. DB warehouse=80 store=19 OK");

  // cleanup product rows
  await prisma.saleItem.deleteMany({ where: { productId: product.id } });
  await prisma.sale.deleteMany({
    where: { items: { some: { productId: product.id } } },
  });
  await prisma.transferItem.deleteMany({ where: { productId: product.id } });
  await prisma.batch.deleteMany({ where: { productId: product.id } });
  await prisma.stockBalance.deleteMany({ where: { productId: product.id } });
  await prisma.product.delete({ where: { id: product.id } });

  console.log("\nFOUNDATION CYCLE READY — UI can use the same path.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
