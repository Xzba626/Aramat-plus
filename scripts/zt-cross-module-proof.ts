/**
 * Cross-module chain: expense → dashboard net; discount request → approve → sale; wipe guard.
 * Run: npx tsx scripts/zt-cross-module-proof.ts
 */
import assert from "node:assert/strict";
import {
  AccountingType,
  ExpensePeriodicity,
  LocationType,
  PrismaClient,
  Role,
  StoreKind,
} from "@prisma/client";
import { addBatch } from "../src/lib/services/stock.service";
import { createSale } from "../src/lib/services/sale.service";
import { createExpense } from "../src/lib/services/expense.service";
import { getDashboardPayload } from "../src/lib/services/dashboard.service";
import { createDiscountRequest } from "../src/lib/services/discount-request.service";
import { decideDiscountRequest } from "../src/lib/services/discount-request.service";

const prisma = new PrismaClient();

async function main() {
  console.log("=== ZT Cross-module proof ===\n");

  const company = await prisma.company.findFirst();
  assert.ok(company);
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
      where: { companyId: company.id, role: Role.SELLER, isActive: true },
    });
    assert.ok(seller);
    await prisma.user.update({
      where: { id: seller.id },
      data: { storeId: store.id },
    });
  }

  // --- Expense → Net ---
  const expenseType = await prisma.expenseType.findFirst({
    where: { companyId: company.id },
  });
  assert.ok(expenseType);
  const before = await getDashboardPayload(company.id);
  await createExpense({
    companyId: company.id,
    createdById: owner.id,
    expenseTypeId: expenseType.id,
    amount: 17,
    storeId: store.id,
    periodicity: ExpensePeriodicity.ONCE,
    description: "zt-cross-rent",
  });
  const afterExp = await getDashboardPayload(company.id);
  const dExp = (afterExp.today.expenses ?? 0) - (before.today.expenses ?? 0);
  const dNet =
    (afterExp.today.netProfit ?? afterExp.today.profit) -
    (before.today.netProfit ?? before.today.profit);
  assert.ok(Math.abs(dExp - 17) < 0.02, `expense Δ 17 got ${dExp}`);
  assert.ok(Math.abs(dNet - -17) < 0.05, `net should drop ~17 got ${dNet}`);
  console.log("✓ Expense → Dashboard expenses/net");

  // --- Discount request → approve → sale with discount ---
  const product = await prisma.product.create({
    data: {
      name: `ZT Cross ${Date.now()}`,
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
        locationType: LocationType.STORE,
        locationId: store.id,
        quantity: 5,
        costPerUnit: 40,
        notes: "zt-cross",
      });
    },
    { maxWait: 15_000, timeout: 60_000 }
  );

  const req = await createDiscountRequest({
    companyId: company.id,
    requesterId: seller.id,
    storeId: store.id,
    originalAmount: 100,
    amount: 10,
    percent: 10,
    reason: "zt-cross-discount",
    items: [{ productId: product.id, quantity: 1, salePrice: 100 }],
  });

  const notif = await prisma.notification.findFirst({
    where: { userId: owner.id, entityId: req.id },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(notif, "owner notified on discount request");

  await decideDiscountRequest({
    companyId: company.id,
    requestId: req.id,
    reviewerId: owner.id,
    decision: "APPROVE",
  });

  const sale = await createSale({
    companyId: company.id,
    sellerId: seller.id,
    storeId: store.id,
    paymentMethod: "CASH",
    discountRequestId: req.id,
    items: [{ productId: product.id, quantity: 1 }],
  });
  assert.ok(sale.finalAmount <= 90.01, `discounted total expect ≤90 got ${sale.finalAmount}`);
  console.log("✓ Discount request→approve→sale", sale.finalAmount);

  const log = await prisma.activityLog.findFirst({
    where: {
      companyId: company.id,
      action: { contains: "DISCOUNT" },
    },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(log, "discount activity log");

  // --- Wipe setting present (not executing wipe) ---
  const wipeSetting = await prisma.setting.findFirst({
    where: { companyId: company.id, key: "wipeMaster" },
  });
  console.log(
    wipeSetting
      ? "✓ wipeMaster setting exists (wipe not executed in cert)"
      : "NOTE: wipeMaster not set — optional until Owner configures"
  );

  console.log("\nPASS: ZT Cross-module — expense→net, discount→sale");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
