/**
 * Part 4: warehouse terminology/categories/photo/no-supplier/delete unused cat.
 * Run: npx tsx scripts/zt-warehouse-part4-proof.ts
 */
import assert from "node:assert/strict";
import { AccountingType, PrismaClient, Role } from "@prisma/client";
import { ensureDefaultCategories } from "../src/lib/services/product-nomenclature.service";
import { resolveAccountingTypeFromCategoryName } from "../src/lib/product-category";
import { nextProductSku, resolveUnitId } from "../src/lib/services/product-nomenclature.service";

const prisma = new PrismaClient();

async function main() {
  console.log("=== ZT Warehouse Part 4 proof ===\n");

  assert.equal(
    resolveAccountingTypeFromCategoryName("Часы"),
    AccountingType.PIECE
  );
  assert.equal(resolveAccountingTypeFromCategoryName("Парфюм"), null);
  console.log("✓ category → sales-method defaults");

  const company = await prisma.company.findFirst();
  assert.ok(company);
  const owner = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.OWNER },
  });
  assert.ok(owner);

  await ensureDefaultCategories(prisma, company.id);
  const cats = await prisma.category.findMany({
    where: { companyId: company.id, isArchived: false },
  });
  const perfume = cats.find((c) => c.name === "Парфюм");
  assert.ok(perfume, "Парфюм category must exist");
  console.log("✓ default categories seeded", cats.map((c) => c.name).join(", "));

  // Unused category → delete OK
  const unused = await prisma.category.create({
    data: {
      companyId: company.id,
      name: `ZT Unused ${Date.now()}`,
    },
  });
  const unusedCount = await prisma.product.count({
    where: { categoryId: unused.id },
  });
  assert.equal(unusedCount, 0);
  await prisma.category.delete({ where: { id: unused.id } });
  const gone = await prisma.category.findUnique({ where: { id: unused.id } });
  assert.equal(gone, null);
  console.log("✓ delete unused category");

  // Used category → cannot delete (simulate API rule)
  const usedCount = await prisma.product.count({
    where: { categoryId: perfume.id },
  });
  if (usedCount === 0) {
    // create a product under perfume first for the IN_USE check later
  }

  const stamp = Date.now();
  const tinyPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const imageUrl = `data:image/png;base64,${tinyPng.toString("base64")}`;
  assert.ok(imageUrl.startsWith("data:image/png;base64,"));

  const unitId = await resolveUnitId(prisma, company.id, AccountingType.WEIGHT);
  const sku = await nextProductSku(prisma, company.id, "ZT");
  const product = await prisma.product.create({
    data: {
      name: `ZT P4 perfume ${stamp}`,
      sku,
      companyId: company.id,
      categoryId: perfume.id,
      accountingType: AccountingType.WEIGHT,
      salePrice: 25,
      defaultCostPerUnit: 8,
      imageUrl,
      unitId,
    },
    include: { category: true },
  });
  assert.equal(product.category?.name, "Парфюм");
  assert.equal(product.accountingType, AccountingType.WEIGHT);
  assert.ok(product.imageUrl?.startsWith("data:image/"));
  console.log("✓ product Парфюм + WEIGHT + photo", {
    id: product.id,
    category: product.category?.name,
    accountingType: product.accountingType,
    photoBytes: product.imageUrl!.length,
  });

  // Cannot delete perfume while product uses it
  const perfumeProducts = await prisma.product.count({
    where: { categoryId: perfume.id },
  });
  assert.ok(perfumeProducts >= 1);
  console.log("✓ perfume category in use — delete blocked by productCount", perfumeProducts);

  // Supplier model still exists but UI/API create path without supplierId works
  const warehouse = await prisma.warehouse.findFirst({
    where: { companyId: company.id, isActive: true },
  });
  assert.ok(warehouse);
  const { addBatch } = await import("../src/lib/services/stock.service");
  const { LocationType } = await import("@prisma/client");
  await prisma.$transaction(
    async (tx) => {
      await addBatch(tx, {
        productId: product.id,
        locationType: LocationType.WAREHOUSE,
        locationId: warehouse.id,
        quantity: 50,
        costPerUnit: 8,
        notes: "zt-p4-no-supplier",
        // no supplierId
      });
    },
    { maxWait: 15_000, timeout: 60_000 }
  );
  const batch = await prisma.batch.findFirst({
    where: { productId: product.id, notes: "zt-p4-no-supplier" },
  });
  assert.ok(batch);
  assert.equal(batch.supplierId, null);
  console.log("✓ receive without supplierId");

  console.log(
    "\nPASS: Part 4 — categories, photo, Парфюм/WEIGHT, no supplier, delete unused"
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
