/**
 * Final gate: continuous warehouse → analytics chain (one product, one flow).
 * Run: npx tsx scripts/test-e2e-chain.ts
 */
import {
  PrismaClient,
  AccountingType,
  Role,
  StoreKind,
  LocationType,
  ReturnReasonCode,
  WriteOffReasonCode,
  InventoryStatus,
  SaleStatus,
} from "@prisma/client";
import { addBatch, getQtyAtLocation } from "../src/lib/services/stock.service";
import { createTransfer } from "../src/lib/services/transfer.service";
import { createSale } from "../src/lib/services/sale.service";
import {
  createSaleReturn,
  decideSaleReturn,
} from "../src/lib/services/sale-return.service";
import { createWarehouseWriteOff } from "../src/lib/services/write-off.service";
import {
  createInventorySession,
  updateInventoryCounts,
  approveInventorySession,
} from "../src/lib/services/revision.service";
import { getDashboardPayload } from "../src/lib/services/dashboard.service";
import { getAnalyticsBreakdown } from "../src/lib/services/analytics.service";

const prisma = new PrismaClient();

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function main() {
  console.log("=== E2E: product → receive → transfer → sale → return → write-off → revision → dash/analytics/journal ===\n");

  const company = await prisma.company.findFirst();
  assert(company, "company");
  const warehouse = await prisma.warehouse.findFirst({
    where: { companyId: company.id, isActive: true },
  });
  assert(warehouse, "warehouse");
  const store = await prisma.store.findFirst({
    where: { companyId: company.id, kind: StoreKind.BRANCH, isActive: true },
  });
  assert(store, "store");
  const owner = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.OWNER },
  });
  assert(owner, "owner");
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
  assert(seller, "seller");

  // Close any open revision that would block sales on this store
  await prisma.inventorySession.updateMany({
    where: { storeId: store.id, status: InventoryStatus.IN_PROGRESS },
    data: { status: InventoryStatus.CANCELLED, completedAt: new Date() },
  });
  await prisma.store.update({
    where: { id: store.id },
    data: { status: "ACTIVE" },
  });

  const tag = `E2E-${Date.now()}`;
  const product = await prisma.product.create({
    data: {
      name: tag,
      companyId: company.id,
      accountingType: AccountingType.PIECE,
      salePrice: 100,
      minStock: 2,
    },
  });
  console.log("1. Create product OK");

  await prisma.$transaction(async (tx) => {
    await addBatch(tx, {
      productId: product.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 100,
      costPerUnit: 40,
      notes: "e2e-receive",
    });
  });
  let wh = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.WAREHOUSE,
    locationId: warehouse.id,
  });
  assert(wh === 100, `warehouse 100 got ${wh}`);
  console.log("2. Receive batch 100 → warehouse OK");

  await createTransfer({
    companyId: company.id,
    fromWarehouseId: warehouse.id,
    toStoreId: store.id,
    createdById: owner.id,
    items: [{ productId: product.id, quantity: 40 }],
  });
  wh = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.WAREHOUSE,
    locationId: warehouse.id,
  });
  let st = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: store.id,
  });
  assert(wh === 60, `warehouse 60 got ${wh}`);
  assert(st === 40, `store 40 got ${st}`);
  console.log("3. Transfer 40 → store OK (wh=60 st=40)");

  const sale = await createSale({
    companyId: company.id,
    storeId: store.id,
    sellerId: seller.id,
    items: [{ productId: product.id, quantity: 10 }],
    paymentMethod: "CASH",
  });
  st = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: store.id,
  });
  assert(st === 30, `store 30 after sale got ${st}`);
  console.log("4. Sale 10 OK (store=30)");

  const saleFull = await prisma.sale.findUniqueOrThrow({
    where: { id: sale.id },
    include: { items: true },
  });
  const saleItem = saleFull.items[0];
  assert(saleItem, "sale item");

  const ret = await createSaleReturn({
    companyId: company.id,
    saleId: sale.id,
    requesterId: seller.id,
    reasonCode: ReturnReasonCode.DEFECT,
    items: [{ saleItemId: saleItem.id, quantity: 3 }],
  });
  await decideSaleReturn({
    companyId: company.id,
    returnId: ret.id,
    reviewerId: owner.id,
    decision: "APPROVE",
  });
  st = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: store.id,
  });
  assert(st === 33, `store 33 after partial return got ${st}`);
  const saleAfter = await prisma.sale.findUniqueOrThrow({
    where: { id: sale.id },
  });
  assert(
    saleAfter.status === SaleStatus.PARTIAL_RETURN,
    `PARTIAL_RETURN got ${saleAfter.status}`
  );
  console.log("5. Partial return 3 approved OK (store=33, PARTIAL_RETURN)");

  await createWarehouseWriteOff({
    companyId: company.id,
    createdById: owner.id,
    reasonCode: WriteOffReasonCode.BROKEN,
    comment: "e2e-writeoff",
    items: [{ productId: product.id, quantity: 5 }],
  });
  wh = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.WAREHOUSE,
    locationId: warehouse.id,
  });
  assert(wh === 55, `warehouse 55 after write-off got ${wh}`);
  console.log("6. Write-off 5 from warehouse OK (wh=55)");

  const session = await createInventorySession({
    companyId: company.id,
    storeId: store.id,
    createdById: owner.id,
    comment: "e2e-revision",
  });
  const invItem = await prisma.inventoryItem.findFirst({
    where: { sessionId: session.id, productId: product.id },
  });
  assert(invItem, "revision item for product");
  // Counted 31 → difference -2 vs expected 33
  await updateInventoryCounts({
    companyId: company.id,
    sessionId: session.id,
    userId: owner.id,
    items: [{ productId: product.id, countedQty: 31 }],
  });
  await approveInventorySession({
    companyId: company.id,
    sessionId: session.id,
    approvedById: owner.id,
  });
  st = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: store.id,
  });
  assert(st === 31, `store 31 after revision got ${st}`);
  console.log("7. Revision count 31 approved OK (store=31)");

  const dash = await getDashboardPayload(company.id);
  assert(dash && typeof dash === "object", "dashboard payload");
  assert("today" in dash && "stores" in dash, "dashboard shape");
  console.log("8. Dashboard payload OK");

  const analytics = await getAnalyticsBreakdown(company.id, "month");
  assert(analytics?.network, "analytics.network");
  assert(Array.isArray(analytics.products), "analytics.products");
  const productRow = analytics.products.find(
    (p: { name?: string }) => p.name === tag
  );
  assert(productRow, "E2E product in analytics.products");
  assert(
    Math.abs(Number(productRow.sold) - 7) < 0.01,
    `analytics sold 7 got ${productRow.sold}`
  );
  console.log("9. Analytics OK (net sold=7 for E2E product)");

  const recent = await prisma.activityLog.findMany({
    where: {
      companyId: company.id,
      createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
      action: {
        in: [
          "WRITE_OFF",
          "REVISION_CREATE",
          "REVISION_APPROVE",
          "REVISION_COUNT",
          "TRANSFER_CREATE",
          "RETURN_REQUEST",
          "RETURN_APPROVE",
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  assert(recent.length > 0, "journal has recent chain entries");
  const actions = new Set(recent.map((r) => r.action));
  assert(actions.has("WRITE_OFF"), "journal WRITE_OFF");
  assert(
    actions.has("REVISION_CREATE") || actions.has("REVISION_APPROVE"),
    "journal revision"
  );
  console.log(
    `10. Journal OK (${recent.length} entries; ${[...actions].join(", ")})`
  );

  // Cleanup (best-effort; leave inventory session approved)
  await prisma.saleReturnItem.deleteMany({ where: { returnId: ret.id } });
  await prisma.saleReturn.delete({ where: { id: ret.id } }).catch(() => undefined);
  await prisma.saleItem.deleteMany({ where: { saleId: sale.id } });
  await prisma.sale.delete({ where: { id: sale.id } }).catch(() => undefined);
  await prisma.inventoryItem.deleteMany({ where: { sessionId: session.id } });
  await prisma.inventorySession.delete({ where: { id: session.id } }).catch(() => undefined);
  await prisma.transferItem.deleteMany({ where: { productId: product.id } });
  await prisma.batch.deleteMany({ where: { productId: product.id } });
  await prisma.stockBalance.deleteMany({ where: { productId: product.id } });
  await prisma.product.delete({ where: { id: product.id } }).catch(() => undefined);

  console.log("\nE2E CHAIN PASSED");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
