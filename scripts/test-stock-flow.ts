/**
 * ERP stock flow: Warehouse → Store → Sale
 * Run: npx tsx scripts/test-stock-flow.ts
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

const prisma = new PrismaClient();

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function main() {
  console.log("=== Stock flow: Warehouse → Store → Sale ===\n");

  const company = await prisma.company.findFirst();
  assert(company, "company exists");

  const warehouse = await prisma.warehouse.findFirst({
    where: { companyId: company.id, isActive: true },
  });
  assert(warehouse, "warehouse exists");

  const store = await prisma.store.findFirst({
    where: { companyId: company.id, kind: StoreKind.BRANCH, isActive: true },
  });
  assert(store, "branch store exists");

  const owner = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.OWNER },
  });
  assert(owner, "owner exists");

  let seller = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.SELLER, storeId: store.id },
  });
  if (!seller) {
    seller = await prisma.user.findFirst({
      where: { companyId: company.id, role: Role.SELLER },
    });
    if (seller) {
      await prisma.user.update({
        where: { id: seller.id },
        data: { storeId: store.id },
      });
    }
  }
  assert(seller, "seller exists");

  const product = await prisma.product.create({
    data: {
      name: `Flow Test ${Date.now()}`,
      companyId: company.id,
      accountingType: AccountingType.PIECE,
      salePrice: 100,
      minStock: 2,
    },
  });

  // 1) Receive 100 on central warehouse
  await prisma.$transaction(async (tx) => {
    await addBatch(tx, {
      productId: product.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 100,
      costPerUnit: 40,
      notes: "flow-test-batch",
    });
  });

  let whQty = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.WAREHOUSE,
    locationId: warehouse.id,
  });
  let storeQty = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: store.id,
  });
  assert(whQty === 100, `warehouse after receive = 100, got ${whQty}`);
  assert(storeQty === 0, `store after receive = 0, got ${storeQty}`);
  console.log("✓ Receive 100 on warehouse");

  // 2) Transfer 20 to store
  await createTransfer({
    companyId: company.id,
    fromWarehouseId: warehouse.id,
    toStoreId: store.id,
    createdById: owner.id,
    items: [{ productId: product.id, quantity: 20 }],
    notes: "flow-test-transfer",
  });

  whQty = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.WAREHOUSE,
    locationId: warehouse.id,
  });
  storeQty = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: store.id,
  });
  assert(whQty === 80, `warehouse after transfer = 80, got ${whQty}`);
  assert(storeQty === 20, `store after transfer = 20, got ${storeQty}`);
  console.log("✓ Transfer 20 → store (warehouse 80 / store 20)");

  const transferLog = await prisma.activityLog.findFirst({
    where: {
      companyId: company.id,
      action: "TRANSFER_CREATE",
      entityType: "Transfer",
    },
    orderBy: { createdAt: "desc" },
  });
  assert(transferLog, "TRANSFER_CREATE in ActivityLog");
  console.log("✓ ActivityLog TRANSFER_CREATE");

  // 3) Sale 5 from store (seller POS)
  const sale = await createSale({
    companyId: company.id,
    storeId: store.id,
    sellerId: seller.id,
    items: [{ productId: product.id, quantity: 5 }],
    paymentMethod: "CASH",
  });

  whQty = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.WAREHOUSE,
    locationId: warehouse.id,
  });
  storeQty = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: store.id,
  });
  assert(whQty === 80, `warehouse after sale still 80, got ${whQty}`);
  assert(storeQty === 15, `store after sale = 15, got ${storeQty}`);
  assert(sale.items.length >= 1, "sale has items");
  console.log("✓ Sale 5 (warehouse 80 / store 15)");

  const saleLog = await prisma.activityLog.findFirst({
    where: {
      companyId: company.id,
      action: "SALE_CREATE",
      entityId: sale.id,
    },
  });
  assert(saleLog, "SALE_CREATE in ActivityLog");
  console.log("✓ ActivityLog SALE_CREATE");

  // Cleanup test product stock leftovers (keep audit trail)
  await prisma.saleItem.deleteMany({ where: { saleId: sale.id } });
  await prisma.sale.delete({ where: { id: sale.id } });
  await prisma.batch.deleteMany({ where: { productId: product.id } });
  await prisma.stockBalance.deleteMany({ where: { productId: product.id } });
  await prisma.transferItem.deleteMany({ where: { productId: product.id } });
  await prisma.product.delete({ where: { id: product.id } });

  console.log("\nALL STOCK FLOW TESTS PASSED");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
