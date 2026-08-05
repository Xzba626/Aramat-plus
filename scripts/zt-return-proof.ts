/**
 * Zero-trust: customer return auto-restores stock + analytics.
 * Run: npx tsx scripts/zt-return-proof.ts
 */
import assert from "node:assert/strict";
import {
  AccountingType,
  LocationType,
  PrismaClient,
  ReturnReasonCode,
  Role,
  StoreKind,
} from "@prisma/client";
import { addBatch, getQtyAtLocation } from "../src/lib/services/stock.service";
import { createTransfer } from "../src/lib/services/transfer.service";
import { createSale } from "../src/lib/services/sale.service";
import {
  createSaleReturn,
  decideSaleReturn,
} from "../src/lib/services/sale-return.service";
import { getDashboardPayload } from "../src/lib/services/dashboard.service";

const prisma = new PrismaClient();

async function main() {
  console.log("=== ZT Customer return proof ===\n");

  const company = await prisma.company.findFirst();
  assert.ok(company);
  const warehouse = await prisma.warehouse.findFirst({
    where: { companyId: company.id, isActive: true },
  });
  assert.ok(warehouse);
  const store = await prisma.store.findFirst({
    where: { companyId: company.id, kind: StoreKind.BRANCH, isActive: true },
  });
  assert.ok(store);
  const owner = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.OWNER },
  });
  assert.ok(owner);
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
      where: { companyId: company.id, role: Role.SELLER },
    });
    assert.ok(seller);
    await prisma.user.update({
      where: { id: seller.id },
      data: { storeId: store.id },
    });
  }

  const product = await prisma.product.create({
    data: {
      name: `ZT Return ${Date.now()}`,
      companyId: company.id,
      accountingType: AccountingType.PIECE,
      salePrice: 100,
      defaultCostPerUnit: 40,
    },
  });

  await prisma.$transaction(
    async (tx) => {
      await addBatch(tx, {
        productId: product.id,
        locationType: LocationType.WAREHOUSE,
        locationId: warehouse.id,
        quantity: 20,
        costPerUnit: 40,
      salePrice: 100,
        notes: "zt-return",
      });
    },
    { maxWait: 15_000, timeout: 60_000 }
  );

  await createTransfer({
    companyId: company.id,
    fromWarehouseId: warehouse.id,
    toStoreId: store.id,
    createdById: owner.id,
    items: [{ productId: product.id, quantity: 10 }],
  });

  const sale = await createSale({
    companyId: company.id,
    sellerId: seller.id,
    storeId: store.id,
    paymentMethod: "CASH",
    items: [{ productId: product.id, quantity: 2 }],
  });

  const afterSaleQty = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: store.id,
  });
  assert.equal(afterSaleQty, 8);

  const dashAfterSale = await getDashboardPayload(company.id);
  const revAfterSale = dashAfterSale.today.revenue;
  const netAfterSale = dashAfterSale.today.netProfit;

  const ret = await createSaleReturn({
    companyId: company.id,
    saleId: sale.id,
    requesterId: seller.id,
    reasonCode: ReturnReasonCode.CUSTOMER_ERROR,
    reason: "zt client wants money back",
    items: [{ saleItemId: sale.items[0].id, quantity: 1 }],
  });

  const reqLog = await prisma.activityLog.findFirst({
    where: {
      companyId: company.id,
      action: "RETURN_REQUEST",
      entityId: ret.id,
    },
  });
  assert.ok(reqLog, "RETURN_REQUEST activity log");

  const notif = await prisma.notification.findFirst({
    where: {
      userId: owner.id,
      type: "RETURN_REQUEST",
      entityId: ret.id,
    },
  });
  assert.ok(notif, "Owner notification on return request");

  // Owner must NOT manually recreate return — only decide
  await decideSaleReturn({
    companyId: company.id,
    returnId: ret.id,
    reviewerId: owner.id,
    decision: "APPROVE",
  });

  const afterReturnQty = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: store.id,
  });
  assert.equal(afterReturnQty, 9, "stock must auto-restore +1 after approve");

  const dashAfterReturn = await getDashboardPayload(company.id);
  assert.ok(
    dashAfterReturn.today.revenue <= revAfterSale + 0.01,
    "dashboard revenue should not stay inflated after approved return"
  );
  assert.ok(
    Math.abs(dashAfterReturn.today.revenue - (revAfterSale - 100)) < 0.5,
    `revenue should drop ~100: before=${revAfterSale} after=${dashAfterReturn.today.revenue}`
  );
  assert.ok(
    dashAfterReturn.today.netProfit <= netAfterSale + 0.01,
    "net profit should not stay inflated after return"
  );

  const approveLog = await prisma.activityLog.findFirst({
    where: {
      companyId: company.id,
      action: "RETURN_APPROVE",
      entityId: ret.id,
    },
  });
  assert.ok(approveLog, "RETURN_APPROVE activity log");

  const updatedSale = await prisma.sale.findUnique({ where: { id: sale.id } });
  assert.ok(
    updatedSale?.status === "PARTIAL_RETURN" ||
      updatedSale?.status === "RETURNED",
    `sale status after return: ${updatedSale?.status}`
  );

  console.log("\nPASS: ZT Return — request→notify→approve→stock+analytics+journal");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
