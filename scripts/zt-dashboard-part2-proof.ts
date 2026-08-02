/**
 * Part 2: Dashboard profit layers + 2-store ranking (one loss-making).
 * Run: npx tsx scripts/zt-dashboard-part2-proof.ts
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
import {
  ensureDefaultPackagingSkus,
  ensurePackagingProduct,
} from "../src/lib/services/packaging.service";

const prisma = new PrismaClient();

async function main() {
  console.log("=== ZT Dashboard Part 2 proof (2 stores) ===\n");

  const company = await prisma.company.findFirst();
  assert.ok(company);
  const owner = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.OWNER },
  });
  assert.ok(owner);
  const warehouse = await prisma.warehouse.findFirst({
    where: { companyId: company.id, isActive: true },
  });
  assert.ok(warehouse);

  let stores = await prisma.store.findMany({
    where: { companyId: company.id, kind: StoreKind.BRANCH, isActive: true },
    orderBy: { name: "asc" },
  });
  if (stores.length < 2) {
    const extra = await prisma.store.create({
      data: {
        name: `ZT Branch ${Date.now()}`,
        companyId: company.id,
        kind: StoreKind.BRANCH,
        isActive: true,
        address: "zt-proof",
      },
    });
    stores = [...stores, extra];
  }
  const [storeA, storeB] = stores;
  assert.ok(storeA && storeB);

  async function sellerFor(storeId: string) {
    let s = await prisma.user.findFirst({
      where: {
        companyId: company!.id,
        role: Role.SELLER,
        storeId,
        isActive: true,
      },
    });
    if (!s) {
      s = await prisma.user.create({
        data: {
          email: `zt-seller-${storeId.slice(-6)}-${Date.now()}@test.local`,
          name: "ZT Seller",
          role: Role.SELLER,
          companyId: company!.id,
          storeId,
          passwordHash: "unused",
          isActive: true,
        },
      });
    }
    return s;
  }
  const sellerA = await sellerFor(storeA.id);
  const sellerB = await sellerFor(storeB.id);

  await ensureDefaultPackagingSkus(company.id);
  const sku = await prisma.packagingSku.findFirst({
    where: { companyId: company.id, volumeMl: 10, isActive: true },
  });
  assert.ok(sku);
  const bottle = await ensurePackagingProduct(sku.id);
  await prisma.product.update({
    where: { id: bottle.id },
    data: { defaultCostPerUnit: 4, salePrice: 0 },
  });

  const perfume = await prisma.product.create({
    data: {
      name: `ZT P2 perfume ${Date.now()}`,
      companyId: company.id,
      accountingType: AccountingType.WEIGHT,
      salePrice: 30,
      defaultCostPerUnit: 10,
    },
  });

  await prisma.$transaction(
    async (tx) => {
      for (const store of [storeA, storeB]) {
        await addBatch(tx, {
          productId: perfume.id,
          locationType: LocationType.STORE,
          locationId: store.id,
          quantity: 100,
          costPerUnit: 10,
          notes: "zt-p2-perfume",
        });
        await addBatch(tx, {
          productId: bottle.id,
          locationType: LocationType.STORE,
          locationId: store.id,
          quantity: 30,
          costPerUnit: 4,
          notes: "zt-p2-bottle",
        });
      }
    },
    { maxWait: 15_000, timeout: 60_000 }
  );

  const expenseType = await prisma.expenseType.findFirst({
    where: { companyId: company.id, NOT: { name: "Флаконы" } },
  });
  assert.ok(expenseType);

  const before = await getDashboardPayload(company.id);
  console.log("BEFORE", {
    revenue: before.today.revenue,
    cogs: before.today.cogs,
    gross: before.today.grossProfit,
    packaging: before.today.packagingCost,
    operational: before.today.operationalExpenses,
    expenses: before.today.expenses,
    net: before.today.netProfit,
    storesNetSum: before.today.storesNetSum,
    match: before.today.storesNetMatchesNetwork,
    deltasRev: before.today.deltas.revenue,
    spark7: before.pulse.netSparkline?.length,
    spark30: before.pulse.netSparklineMonth?.length,
  });

  // Store A: profitable — sell 20ml @ 30 = 600 rev, COGS 200, bottle 4 → gross 400, net ~396 − rent0
  await createSale({
    companyId: company.id,
    sellerId: sellerA.id,
    storeId: storeA.id,
    paymentMethod: "CASH",
    items: [
      { productId: perfume.id, quantity: 20, packagingProductId: bottle.id },
    ],
  });

  // Store B: loss — heavy rent 800 + small sale 10ml = 300 rev, COGS 100, bottle 4 → gross 200 − 800 rent = −604
  await createExpense({
    companyId: company.id,
    createdById: owner.id,
    expenseTypeId: expenseType.id,
    amount: 800,
    storeId: storeB.id,
    periodicity: ExpensePeriodicity.ONCE,
    description: "zt-p2-heavy-rent",
  });
  await createSale({
    companyId: company.id,
    sellerId: sellerB.id,
    storeId: storeB.id,
    paymentMethod: "CASH",
    items: [
      { productId: perfume.id, quantity: 10, packagingProductId: bottle.id },
    ],
  });

  const after = await getDashboardPayload(company.id);

  const dRev = after.today.revenue - before.today.revenue;
  const dCogs = (after.today.cogs ?? 0) - (before.today.cogs ?? 0);
  const dPack =
    (after.today.packagingCost ?? 0) - (before.today.packagingCost ?? 0);
  const dOps =
    (after.today.operationalExpenses ?? 0) -
    (before.today.operationalExpenses ?? 0);
  const dGross =
    (after.today.grossProfit ?? 0) - (before.today.grossProfit ?? 0);
  const dNet = (after.today.netProfit ?? 0) - (before.today.netProfit ?? 0);

  console.log("AFTER", {
    revenue: after.today.revenue,
    cogs: after.today.cogs,
    gross: after.today.grossProfit,
    packaging: after.today.packagingCost,
    operational: after.today.operationalExpenses,
    expenses: after.today.expenses,
    net: after.today.netProfit,
    storesNetSum: after.today.storesNetSum,
    match: after.today.storesNetMatchesNetwork,
    dRev,
    dCogs,
    dPack,
    dOps,
    dGross,
    dNet,
  });

  console.log(
    "STORES RANKED",
    after.stores.map((s, i) => ({
      rank: i + 1,
      name: s.name,
      net: s.netProfit,
      packaging: s.packagingCost,
      ops: s.operationalExpenses,
    }))
  );

  // Revenue +900 (600+300)
  assert.ok(Math.abs(dRev - 900) < 0.5, `dRev 900 got ${dRev}`);
  // COGS +300 (200+100)
  assert.ok(Math.abs(dCogs - 300) < 0.5, `dCogs 300 got ${dCogs}`);
  // Gross +600
  assert.ok(Math.abs(dGross - 600) < 0.5, `dGross 600 got ${dGross}`);
  // Packaging: 2 bottles via FIFO (may be 3–4 each from older batches)
  assert.ok(dPack >= 6 && dPack <= 9, `dPack two bottles got ${dPack}`);
  // Operational includes +800 rent
  assert.ok(dOps >= 799, `dOps ≥800 got ${dOps}`);
  // Net = Gross − packaging − operational (layers identity)
  assert.ok(Math.abs(dNet - (dGross - dPack - dOps)) < 0.1, "net layers");
  assert.ok(
    Math.abs(
      (after.today.expenses ?? 0) -
        ((after.today.packagingCost ?? 0) +
          (after.today.operationalExpenses ?? 0))
    ) < 0.05,
    "expenses = packaging + operational"
  );

  assert.equal(after.today.storesNetMatchesNetwork, true);
  assert.ok(
    Math.abs((after.today.storesNetSum ?? 0) - after.today.netProfit) < 0.05
  );

  // Abs delta fields
  assert.ok(typeof after.today.deltas.revenue.abs === "number");
  assert.ok(typeof after.today.deltas.revenue.current === "number");
  assert.ok(typeof after.today.deltas.revenue.previous === "number");

  // Chart ranges
  assert.equal(after.pulse.netSparkline?.length, 7);
  assert.equal(after.pulse.netSparklineMonth?.length, 30);

  // Ranking: best first; one store must be negative after our ops
  assert.ok(after.stores.length >= 2);
  for (let i = 1; i < after.stores.length; i++) {
    assert.ok(
      after.stores[i - 1].netProfit >= after.stores[i].netProfit - 0.001
    );
  }
  const storeBRow = after.stores.find((s) => s.id === storeB.id);
  assert.ok(storeBRow);
  assert.ok(
    storeBRow.netProfit < 0,
    `store B must be loss-making, got ${storeBRow.netProfit}`
  );

  // Packaging not inside COGS
  assert.ok(
    Math.abs(dCogs - 300) < 0.5,
    "COGS must be perfume only (no bottle)"
  );

  console.log("\nPASS: Part 2 — layers COGS/packaging/opex, abs Δ, 7d+30d, ranked stores, network=Σ");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
