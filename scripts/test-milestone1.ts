/**
 * Milestone 1 integration checks (batches, FIFO transfer, stock).
 * Run: npm run test:milestone1
 */
import {
  PrismaClient,
  LocationType,
  AccountingType,
  Role,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { deductBatchesFifo, addBatch } from "../src/lib/services/stock.service";
import { createTransfer } from "../src/lib/services/transfer.service";

const prisma = new PrismaClient();

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function main() {
  console.log("=== Milestone 1 tests ===\n");

  const company = await prisma.company.findFirst();
  assert(company, "company exists");

  const warehouse = await prisma.warehouse.findFirst({
    where: { companyId: company.id },
  });
  assert(warehouse, "warehouse exists");

  const store = await prisma.store.findFirst({
    where: { companyId: company.id },
  });
  assert(store, "store exists");

  const owner = await prisma.user.findFirst({
    where: { role: Role.OWNER, companyId: company.id },
  });
  assert(owner, "owner exists");

  // --- Separate batches ---
  const product = await prisma.product.create({
    data: {
      name: `Test Product ${Date.now()}`,
      companyId: company.id,
      accountingType: AccountingType.WEIGHT,
      salePrice: 50,
    },
  });

  await prisma.$transaction(async (tx) => {
    await addBatch(tx, {
      productId: product.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 100,
      costPerUnit: 10,
      notes: "batch-A",
    });
    await addBatch(tx, {
      productId: product.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 50,
      costPerUnit: 20,
      notes: "batch-B",
    });
  });

  const batches = await prisma.batch.findMany({
    where: {
      productId: product.id,
      locationType: LocationType.WAREHOUSE,
      quantity: { gt: 0 },
    },
    orderBy: { receivedAt: "asc" },
  });
  assert(batches.length === 2, `expected 2 separate batches, got ${batches.length}`);
  assert(
    Number(batches[0].costPerUnit) === 10 && Number(batches[1].costPerUnit) === 20,
    "batch costs preserved separately"
  );
  console.log("✓ Batches stay separate (no merge)");

  // --- FIFO deduct ---
  await prisma.$transaction(async (tx) => {
    const consumed = await deductBatchesFifo(tx, {
      productId: product.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 120,
    });
    assert(consumed.length === 2, "FIFO spans two batches");
    assert(Number(consumed[0].quantity) === 100, "first batch fully consumed");
    assert(Number(consumed[0].costPerUnit) === 10, "first batch cost");
    assert(Number(consumed[1].quantity) === 20, "second batch partial");
    assert(Number(consumed[1].costPerUnit) === 20, "second batch cost");
  });

  // Restock for transfer test
  await prisma.$transaction(async (tx) => {
    await addBatch(tx, {
      productId: product.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 80,
      costPerUnit: 15,
    });
  });

  console.log("✓ FIFO deduction works");

  // --- Transfer ---
  const beforeWh = await prisma.stockBalance.findUnique({
    where: {
      productId_locationType_locationId: {
        productId: product.id,
        locationType: LocationType.WAREHOUSE,
        locationId: warehouse.id,
      },
    },
  });
  const beforeQty = Number(beforeWh?.quantity ?? 0);

  const transfer = await createTransfer({
    companyId: company.id,
    fromWarehouseId: warehouse.id,
    toStoreId: store.id,
    createdById: owner.id,
    items: [{ productId: product.id, quantity: 30 }],
  });
  assert(transfer.items.length >= 1, "transfer has items");

  const afterWh = await prisma.stockBalance.findUnique({
    where: {
      productId_locationType_locationId: {
        productId: product.id,
        locationType: LocationType.WAREHOUSE,
        locationId: warehouse.id,
      },
    },
  });
  const afterStore = await prisma.stockBalance.findUnique({
    where: {
      productId_locationType_locationId: {
        productId: product.id,
        locationType: LocationType.STORE,
        locationId: store.id,
      },
    },
  });

  assert(
    Number(afterWh?.quantity ?? 0) === beforeQty - 30,
    "warehouse decreased by 30"
  );
  assert(Number(afterStore?.quantity ?? 0) >= 30, "store increased");
  console.log("✓ Transfer warehouse→store updates stock");

  // --- Oversell fails ---
  let failed = false;
  try {
    await createTransfer({
      companyId: company.id,
      fromWarehouseId: warehouse.id,
      toStoreId: store.id,
      createdById: owner.id,
      items: [{ productId: product.id, quantity: 999999 }],
    });
  } catch {
    failed = true;
  }
  assert(failed, "oversell should throw");
  console.log("✓ Oversell rejected");

  // --- Price history ---
  const oldPrice = product.salePrice;
  await prisma.$transaction(async (tx) => {
    await tx.priceHistory.create({
      data: {
        productId: product.id,
        oldPrice,
        newPrice: 77,
        changedById: owner.id,
      },
    });
    await tx.product.update({
      where: { id: product.id },
      data: { salePrice: 77 },
    });
  });
  const history = await prisma.priceHistory.count({ where: { productId: product.id } });
  assert(history >= 1, "price history recorded");
  console.log("✓ Price history recorded");

  // --- Auth password hash check ---
  const ok = await bcrypt.compare("owner1234", owner.passwordHash);
  assert(ok, "owner password verifies");
  console.log("✓ Auth password hash ok");

  // cleanup test product stock/batches
  await prisma.transferItem.deleteMany({
    where: { transferId: transfer.id },
  });
  await prisma.transfer.delete({ where: { id: transfer.id } });
  await prisma.batch.deleteMany({ where: { productId: product.id } });
  await prisma.stockBalance.deleteMany({ where: { productId: product.id } });
  await prisma.priceHistory.deleteMany({ where: { productId: product.id } });
  await prisma.product.delete({ where: { id: product.id } });

  console.log("\n=== All milestone 1 tests passed ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
