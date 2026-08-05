/**
 * Block 4a smoke: PackagingSku + stock Product + receive via addBatch.
 * Does not touch FIFO rewrite. Run after migrate:
 *   npx tsx scripts/test-packaging-4a.ts
 */
import assert from "node:assert/strict";
import {
  AccountingType,
  BatchOrigin,
  LocationType,
  ProductKind,
  PrismaClient,
} from "@prisma/client";
import {
  ensureDefaultPackagingSkus,
  ensurePackagingProduct,
  listPackagingSkus,
} from "../src/lib/services/packaging.service";
import { addBatch } from "../src/lib/services/stock.service";
import { decimalToNumber } from "../src/lib/utils";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Block 4a packaging smoke ===\n");

  const company = await prisma.company.findFirst();
  assert.ok(company, "company required (run seed)");
  const warehouse = await prisma.warehouse.findFirst({
    where: { companyId: company.id, isActive: true },
  });
  assert.ok(warehouse, "warehouse required");

  const created = await ensureDefaultPackagingSkus(company.id);
  console.log(`✓ Defaults ensured (new: ${created.length})`);

  const skus = await listPackagingSkus(company.id);
  assert.ok(skus.length >= 5, "need at least 5 default volumes");
  const thirty = skus.find((s) => s.volumeMl === 30);
  assert.ok(thirty?.productId, "30ml must have stock Product");
  assert.equal(
    (
      await prisma.product.findUniqueOrThrow({ where: { id: thirty!.productId! } })
    ).kind,
    ProductKind.PACKAGING
  );
  assert.equal(
    (
      await prisma.product.findUniqueOrThrow({ where: { id: thirty!.productId! } })
    ).accountingType,
    AccountingType.PIECE
  );
  console.log("✓ PackagingSku 30ml → Product PACKAGING/PIECE");

  // Forbidden pattern check: no aroma product named with ml suffix required
  const bad = await prisma.product.findFirst({
    where: {
      companyId: company.id,
      kind: ProductKind.STANDARD,
      name: { contains: "30ml" },
    },
  });
  assert.equal(bad, null);
  console.log("✓ No STANDARD aroma forced as *30ml* product in this smoke");

  await ensurePackagingProduct(thirty!.id);
  const before = thirty!.warehouseQty;

  await prisma.$transaction(async (tx) => {
    await addBatch(tx, {
      productId: thirty!.productId!,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 50,
      costPerUnit: 2,
      salePrice: 0,
      origin: BatchOrigin.PURCHASE,
      notes: "4a-smoke",
    });
  });

  const bal = await prisma.stockBalance.findUnique({
    where: {
      productId_locationType_locationId: {
        productId: thirty!.productId!,
        locationType: LocationType.WAREHOUSE,
        locationId: warehouse.id,
      },
    },
  });
  assert.ok(bal);
  assert.equal(decimalToNumber(bal!.quantity), before + 50);
  console.log(`✓ Receive 50 bottles via addBatch → stock ${before + 50}`);

  const afterList = await listPackagingSkus(company.id);
  const afterThirty = afterList.find((s) => s.id === thirty!.id)!;
  assert.equal(afterThirty.warehouseQty, before + 50);
  console.log("✓ Catalog list shows warehouse qty");

  console.log("\nBLOCK 4a PACKAGING SMOKE PASSED");
  console.log("Next: Phase 4b POS dual FIFO (not started)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
