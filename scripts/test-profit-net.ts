/**
 * P0: net profit + recurring expense allocation
 * Run: npx tsx scripts/test-profit-net.ts
 */
import {
  PrismaClient,
  ExpensePeriodicity,
  AccountingType,
  Role,
  StoreKind,
  LocationType,
} from "@prisma/client";
import { dailyShareForExpense, sumAllocatedExpenses, createExpense } from "../src/lib/services/expense.service";
import { saleGrossMetrics, withNetProfit } from "../src/lib/services/profit.service";
import { addBatch } from "../src/lib/services/stock.service";
import { createSale } from "../src/lib/services/sale.service";
import { Prisma } from "@prisma/client";

const prisma = new PrismaClient();

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function main() {
  console.log("=== Profit net + expense allocation ===\n");

  // Unit: monthly 3100 in a 31-day month → 100/day
  const jan = new Date(2026, 0, 15);
  const share = dailyShareForExpense(
    {
      amount: 3100,
      periodicity: ExpensePeriodicity.MONTHLY,
      startsAt: new Date(2026, 0, 1),
      endsAt: null,
      incurredAt: new Date(2026, 0, 1),
    },
    jan
  );
  assert(Math.abs(share - 100) < 0.01, `monthly share ~100, got ${share}`);
  console.log("✓ MONTHLY 3100 → 100/day in January");

  const onceShare = dailyShareForExpense(
    {
      amount: 50,
      periodicity: ExpensePeriodicity.ONCE,
      startsAt: new Date(2026, 0, 15),
      endsAt: null,
      incurredAt: new Date(2026, 0, 15),
    },
    jan
  );
  assert(onceShare === 50, `once share 50, got ${onceShare}`);
  console.log("✓ ONCE expense full amount on day");

  const company = await prisma.company.findFirst();
  assert(company, "company");
  const owner = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.OWNER },
  });
  assert(owner, "owner");
  const store = await prisma.store.findFirst({
    where: { companyId: company.id, kind: StoreKind.BRANCH, isActive: true },
  });
  assert(store, "store");
  const warehouse = await prisma.warehouse.findFirst({
    where: { companyId: company.id, isActive: true },
  });
  assert(warehouse, "warehouse");
  let seller = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.SELLER, storeId: store.id },
  });
  assert(seller, "seller");

  let expenseType = await prisma.expenseType.findFirst({
    where: { companyId: company.id },
  });
  if (!expenseType) {
    expenseType = await prisma.expenseType.create({
      data: { name: `Test Rent ${Date.now()}`, companyId: company.id },
    });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const monthlyAmount = days * 10; // 10 per day

  const expense = await createExpense({
    companyId: company.id,
    createdById: owner.id,
    expenseTypeId: expenseType.id,
    amount: monthlyAmount,
    storeId: store.id,
    periodicity: ExpensePeriodicity.MONTHLY,
    startsAt: new Date(today.getFullYear(), today.getMonth(), 1),
    description: "test-profit-net",
  });

  const allocated = await sumAllocatedExpenses({
    companyId: company.id,
    from: today,
    to: today,
    storeId: store.id,
  });
  assert(
    Math.abs(allocated.total - 10) < 0.05,
    `today allocation ~10, got ${allocated.total}`
  );
  console.log(`✓ Allocated today ≈ 10 (got ${allocated.total})`);

  const product = await prisma.product.create({
    data: {
      name: `Profit Test ${Date.now()}`,
      companyId: company.id,
      accountingType: AccountingType.PIECE,
      salePrice: 100,
      minStock: 1,
    },
  });

  await prisma.$transaction(async (tx) => {
    await addBatch(tx, {
      productId: product.id,
      locationType: LocationType.STORE,
      locationId: store.id,
      quantity: 10,
      costPerUnit: 40,
      salePrice: 100,
      notes: "profit-test",
    });
  });

  const sale = await createSale({
    companyId: company.id,
    storeId: store.id,
    sellerId: seller.id,
    items: [{ productId: product.id, quantity: 1 }],
    paymentMethod: "CASH",
  });

  const full = await prisma.sale.findUnique({
    where: { id: sale.id },
    include: { items: true },
  });
  assert(full, "sale");
  const gross = saleGrossMetrics([full]);
  assert(Math.abs(gross.revenue - 100) < 0.01, "revenue 100");
  assert(Math.abs(gross.grossProfit - 60) < 0.01, `gross 60 got ${gross.grossProfit}`);
  const net = withNetProfit(gross, 10);
  assert(Math.abs(net.netProfit - 50) < 0.01, `net 50 got ${net.netProfit}`);
  console.log("✓ Gross 60 − expenses 10 = net 50");

  // Cleanup
  await prisma.saleItem.deleteMany({ where: { saleId: sale.id } });
  await prisma.sale.delete({ where: { id: sale.id } });
  await prisma.batch.deleteMany({ where: { productId: product.id } });
  await prisma.stockBalance.deleteMany({ where: { productId: product.id } });
  await prisma.product.delete({ where: { id: product.id } });
  await prisma.expense.delete({ where: { id: expense.id } });

  console.log("\nALL PROFIT NET TESTS PASSED");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
