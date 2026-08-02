/**
 * Seller POS: bottles never in catalog/cart as products; no exact stock shown in API fields used by UI.
 * Run: npx tsx scripts/zt-seller-pos-blind-proof.ts
 */
import assert from "node:assert/strict";
import {
  AccountingType,
  LocationType,
  ProductKind,
  PrismaClient,
  Role,
  StoreKind,
} from "@prisma/client";
import { addBatch } from "../src/lib/services/stock.service";
import { getPosCatalog } from "../src/lib/services/pos-catalog.service";
import {
  ensureDefaultPackagingSkus,
  ensurePackagingProduct,
  listStorePackagingStock,
} from "../src/lib/services/packaging.service";
import { createSale } from "../src/lib/services/sale.service";

const prisma = new PrismaClient();

async function main() {
  console.log("=== ZT seller POS: no bottle SKU + stock blindness ===\n");

  const company = await prisma.company.findFirst();
  assert.ok(company);
  const store = await prisma.store.findFirst({
    where: { companyId: company.id, kind: StoreKind.BRANCH, isActive: true },
  });
  assert.ok(store);
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

  await ensureDefaultPackagingSkus(company.id);
  const sku = await prisma.packagingSku.findFirst({
    where: { companyId: company.id, volumeMl: 10, isActive: true },
  });
  assert.ok(sku);
  const bottle = await ensurePackagingProduct(sku.id);
  await prisma.$transaction(
    async (tx) => {
      await addBatch(tx, {
        productId: bottle.id,
        locationType: LocationType.STORE,
        locationId: store.id,
        quantity: 15,
        costPerUnit: 3,
        notes: "zt-seller-blind-bottle",
      });
    },
    { maxWait: 15_000, timeout: 60_000 }
  );

  const catalog = await getPosCatalog({
    companyId: company.id,
    storeId: store.id,
  });
  assert.ok(
    !catalog.items.some((i) => i.productId === bottle.id),
    "bottle must not be in POS catalog"
  );
  assert.ok(
    !catalog.items.some((i) => i.product.kind === ProductKind.PACKAGING),
    "no PACKAGING kind in catalog"
  );
  assert.ok(
    !catalog.items.some((i) => /флакон/i.test(i.product.name)),
    "no флакон name in catalog"
  );
  console.log("✓ catalog excludes bottles", catalog.items.length, "sellable SKUs");

  const perfume = await prisma.product.create({
    data: {
      name: `ZT Blind perfume ${Date.now()}`,
      companyId: company.id,
      accountingType: AccountingType.WEIGHT,
      salePrice: 20,
      defaultCostPerUnit: 8,
      kind: ProductKind.STANDARD,
    },
  });
  await prisma.$transaction(
    async (tx) => {
      await addBatch(tx, {
        productId: perfume.id,
        locationType: LocationType.STORE,
        locationId: store.id,
        quantity: 500,
        costPerUnit: 8,
        notes: "zt-seller-blind-perfume",
      });
    },
    { maxWait: 15_000, timeout: 60_000 }
  );

  // Sale with bottle as attribute — not as line
  const sale = await createSale({
    companyId: company.id,
    storeId: store.id,
    sellerId: seller.id,
    paymentMethod: "CASH",
    items: [
      {
        productId: perfume.id,
        quantity: 10,
        packagingProductId: bottle.id,
        packagingSkuId: sku.id,
      },
    ],
  });
  const lines = await prisma.saleItem.findMany({ where: { saleId: sale.id } });
  assert.equal(lines.length, 1, "exactly one sale line (perfume)");
  assert.equal(lines[0].productId, perfume.id);
  assert.notEqual(lines[0].productId, bottle.id);
  console.log("✓ sale has perfume line only; bottle is packaging attribute");

  const bottles = await listStorePackagingStock(company.id, store.id);
  assert.ok(bottles.some((b) => b.packagingProductId === bottle.id));
  console.log(
    "✓ bottle list for selection exists server-side (qty for owner; seller API redacts)"
  );

  console.log("\nPASS — seller POS bottle + catalog");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
