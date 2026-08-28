/**
 * Deterministic stress dataset for local regression (NOT production).
 *
 * Prerequisites: clean local DB + `npm run db:seed`
 *
 * Usage:
 *   STRESS_SEED_MODE=normal  npm run db:seed:stress   # 1 000 products
 *   STRESS_SEED_MODE=stress  npm run db:seed:stress   # 10 000 products
 */
import {
  PrismaClient,
  AccountingType,
  Role,
  StoreKind,
  LocationType,
} from "@prisma/client";
import { assertForensicOrStressSafe } from "../src/lib/db-safety-guard";
import { addBatch, getQtyAtLocation } from "../src/lib/services/stock.service";
import { createTransfer } from "../src/lib/services/transfer.service";
import { createSale } from "../src/lib/services/sale.service";
import { ensureOwnerDirectStore } from "../src/lib/services/owner-direct.service";
import {
  saleGrossMetrics,
  saleItemCogs,
} from "../src/lib/services/profit.service";
import { decimalToNumber } from "../src/lib/utils";

const prisma = new PrismaClient();

type Mode = "normal" | "stress";

function mode(): Mode {
  return process.env.STRESS_SEED_MODE === "stress" ? "stress" : "normal";
}

function cfg(m: Mode) {
  return m === "stress"
    ? {
        products: 10_000,
        branchStores: 10,
        salesTarget: 2_000,
        ownerDirectSales: 200,
        multiBatchProducts: 50,
      }
    : {
        products: 1_000,
        branchStores: 5,
        salesTarget: 400,
        ownerDirectSales: 80,
        multiBatchProducts: 30,
      };
}

/** Mulberry32 — deterministic */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(r: () => number, arr: T[]): T {
  return arr[Math.floor(r() * arr.length)]!;
}

async function ensureReferenceData(companyId: string) {
  const categories = ["Парфюм", "Другое", "Аксессуары", "Уход", "Подарки"];
  const brands = ["GEN", "LUIS", "CHANEL", "DIOR", "LOCAL"];
  const catIds: string[] = [];
  for (const name of categories) {
    const row = await prisma.category.upsert({
      where: { companyId_name: { companyId, name } },
      create: { companyId, name },
      update: {},
    });
    catIds.push(row.id);
  }
  const brandIds: string[] = [];
  for (const name of brands) {
    const row = await prisma.brand.upsert({
      where: { companyId_name: { companyId, name } },
      create: { companyId, name },
      update: {},
    });
    brandIds.push(row.id);
  }
  for (const [symbol, name] of [
    ["шт", "Штука"],
    ["мл", "Миллилитр"],
  ] as const) {
    const exists = await prisma.unit.findFirst({ where: { companyId, symbol } });
    if (!exists) {
      await prisma.unit.create({ data: { companyId, symbol, name } });
    }
  }
  return { catIds, brandIds };
}

async function ensureBranchStores(companyId: string, count: number) {
  const existing = await prisma.store.findMany({
    where: { companyId, kind: StoreKind.BRANCH, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  const stores = [...existing];
  while (stores.length < count) {
    const n = stores.length + 1;
    const s = await prisma.store.create({
      data: {
        companyId,
        kind: StoreKind.BRANCH,
        name: `Stress Store ${n}`,
        isActive: true,
      },
    });
    stores.push(s);
  }
  return stores.slice(0, count);
}

async function main() {
  assertForensicOrStressSafe("stress-seed");
  const m = mode();
  const c = cfg(m);
  const rand = rng(m === "stress" ? 100_000 : 42);
  const tag = `STRESS-${m.toUpperCase()}`;

  console.log(`=== Stress seed [${m}] ===`);
  console.log(JSON.stringify(c, null, 2));

  const company = await prisma.company.findFirstOrThrow();
  const warehouse = await prisma.warehouse.findFirstOrThrow({
    where: { companyId: company.id, isActive: true },
  });
  const owner = await prisma.user.findFirstOrThrow({
    where: { companyId: company.id, role: Role.OWNER },
  });
  const ownerStore = await ensureOwnerDirectStore(company.id);
  const { catIds, brandIds } = await ensureReferenceData(company.id);
  const branchStores = await ensureBranchStores(company.id, c.branchStores);

  const productIds: string[] = [];
  const fifoProducts: string[] = [];

  console.log(`Creating ${c.products} products...`);
  for (let i = 0; i < c.products; i++) {
    const isWeight = rand() < 0.35;
    const accountingType = isWeight
      ? AccountingType.WEIGHT
      : AccountingType.PIECE;
    const duplicateName = i < 20 ? `харизма stress ${i % 5}` : null;
    const name =
      duplicateName ??
      `${tag} ${isWeight ? "ml" : "pcs"} #${String(i + 1).padStart(5, "0")}`;
    const sku = `${tag}-${String(i + 1).padStart(6, "0")}`;
    const salePrice = Math.round((3 + rand() * 50) * 100) / 100;
    const cost = Math.round(salePrice * (0.2 + rand() * 0.5) * 100) / 100;

    const p = await prisma.product.create({
      data: {
        name,
        sku,
        companyId: company.id,
        categoryId: pick(rand, catIds),
        brandId: pick(rand, brandIds),
        accountingType,
        salePrice,
        defaultCostPerUnit: cost,
        minStock: 0,
      },
    });
    productIds.push(p.id);
    if (i < c.multiBatchProducts) fifoProducts.push(p.id);

    const stockQty = i % 17 === 0 ? 0 : Math.floor(5 + rand() * 200);
    if (stockQty > 0) {
      await prisma.$transaction(async (tx) => {
        if (fifoProducts.includes(p.id)) {
          await addBatch(tx, {
            productId: p.id,
            locationType: LocationType.WAREHOUSE,
            locationId: warehouse.id,
            quantity: Math.floor(stockQty * 0.6),
            costPerUnit: cost,
            salePrice,
            notes: `${tag}:batch-A`,
            createdById: owner.id,
          });
          await addBatch(tx, {
            productId: p.id,
            locationType: LocationType.WAREHOUSE,
            locationId: warehouse.id,
            quantity: stockQty - Math.floor(stockQty * 0.6),
            costPerUnit: cost + 2,
            salePrice: salePrice + 1,
            notes: `${tag}:batch-B`,
            createdById: owner.id,
          });
        } else {
          await addBatch(tx, {
            productId: p.id,
            locationType: LocationType.WAREHOUSE,
            locationId: warehouse.id,
            quantity: stockQty,
            costPerUnit: cost,
            salePrice,
            notes: tag,
            createdById: owner.id,
          });
        }
      });
    }

    if ((i + 1) % 200 === 0) console.log(`  products ${i + 1}/${c.products}`);
  }

  console.log("Transferring stock to branch stores...");
  const transferProducts = productIds.filter((_, i) => i % 3 !== 0 && i % 17 !== 0);
  const perStore = Math.max(1, Math.floor(transferProducts.length / branchStores.length));

  for (let si = 0; si < branchStores.length; si++) {
    const store = branchStores[si]!;
    const slice = transferProducts.slice(si * perStore, (si + 1) * perStore);
    if (!slice.length) continue;

    const items: Array<{ productId: string; quantity: number }> = [];
    for (const productId of slice) {
      const whQty = await getQtyAtLocation({
        productId,
        locationType: LocationType.WAREHOUSE,
        locationId: warehouse.id,
      });
      if (whQty < 1) continue;
      const qty = Math.min(whQty, Math.max(1, Math.floor(1 + rand() * 3)));
      items.push({ productId, quantity: qty });
    }
    if (!items.length) continue;

    try {
      await createTransfer({
        companyId: company.id,
        fromWarehouseId: warehouse.id,
        toStoreId: store.id,
        createdById: owner.id,
        items,
        notes: tag,
      });
    } catch (e) {
      console.warn(`  transfer to ${store.name} skipped:`, e instanceof Error ? e.message : e);
    }
  }

  let salesOk = 0;
  let salesFail = 0;
  const saleIds: string[] = [];

  console.log(`Creating ~${c.salesTarget} branch sales...`);
  for (let s = 0; s < c.salesTarget; s++) {
    const store = pick(rand, branchStores);
    const pid = pick(rand, productIds);
    const product = await prisma.product.findUniqueOrThrow({ where: { id: pid } });
    const qty =
      product.accountingType === AccountingType.WEIGHT
        ? Math.max(1, Math.floor(1 + rand() * 20))
        : 1;
    try {
      const sale = await createSale({
        companyId: company.id,
        storeId: store.id,
        sellerId: owner.id,
        items: [
          {
            productId: pid,
            quantity: qty,
            ...(product.accountingType === AccountingType.WEIGHT
              ? { containerSource: "CUSTOMER_BOTTLE" as const }
              : {}),
          },
        ],
        discountAmount:
          s % 11 === 0 ? Math.min(5, decimalToNumber(product.salePrice) * qty * 0.1) : 0,
        paymentMethod: "CASH",
      });
      salesOk++;
      saleIds.push(sale.id);
    } catch {
      salesFail++;
    }
    if ((s + 1) % 100 === 0) console.log(`  branch sales ${s + 1}/${c.salesTarget}`);
  }

  console.log(`Creating ~${c.ownerDirectSales} OWNER_DIRECT sales...`);
  let odOk = 0;
  for (let s = 0; s < c.ownerDirectSales; s++) {
    const pid = pick(rand, productIds);
    const product = await prisma.product.findUniqueOrThrow({ where: { id: pid } });
    const qty =
      product.accountingType === AccountingType.WEIGHT
        ? Math.max(1, Math.floor(1 + rand() * 15))
        : 1;
    try {
      const sale = await createSale({
        companyId: company.id,
        storeId: ownerStore.id,
        sellerId: owner.id,
        items: [
          {
            productId: pid,
            quantity: qty,
            ...(product.accountingType === AccountingType.WEIGHT
              ? { containerSource: "CUSTOMER_BOTTLE" as const }
              : {}),
          },
        ],
        paymentMethod: "CASH",
      });
      odOk++;
      saleIds.push(sale.id);
    } catch {
      /* insufficient stock expected for some */
    }
  }

  // Financial invariant sample on last 50 sales
  const sample = await prisma.sale.findMany({
    where: { id: { in: saleIds.slice(-50) } },
    include: { items: true },
  });
  let invariantFails = 0;
  for (const sale of sample) {
    const m = saleGrossMetrics([sale]);
    const lineCogs = sale.items.reduce(
      (sum, it) => sum + saleItemCogs(it),
      0
    );
    if (Math.abs(m.cogs - lineCogs) > 0.02) invariantFails++;
    if (m.cogs > decimalToNumber(sale.subtotal) + 0.02) invariantFails++;
  }

  const stats = {
    mode: m,
    products: await prisma.product.count({
      where: { sku: { startsWith: tag } },
    }),
    batches: await prisma.batch.count({ where: { notes: { contains: tag } } }),
    branchStores: branchStores.length,
    salesCompleted: await prisma.sale.count({
      where: { status: "COMPLETED" },
    }),
    salesAttemptedOk: salesOk,
    salesAttemptedFail: salesFail,
    ownerDirectOk: odOk,
    invariantSampleFails: invariantFails,
  };

  console.log("\n=== Stress seed complete ===");
  console.log(JSON.stringify(stats, null, 2));
  if (invariantFails > 0) {
    console.warn(`WARNING: ${invariantFails} sales failed COGS invariants in sample`);
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
