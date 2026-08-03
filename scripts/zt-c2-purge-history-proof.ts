/**
 * C2 proof: hardDeleteProductCascade must NOT destroy saleItem history.
 * Run: npx tsx scripts/zt-c2-purge-history-proof.ts
 */
import assert from "node:assert/strict";
import { PrismaClient, ProductKind } from "@prisma/client";
import { hardDeleteProductCascade } from "../src/lib/services/archive-retention.service";

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findFirst({ orderBy: { createdAt: "asc" } });
  assert.ok(company, "company");

  const product = await prisma.product.create({
    data: {
      companyId: company.id,
      name: `[C2 PURGE] ${Date.now()}`,
      kind: ProductKind.STANDARD,
      salePrice: 10,
      isActive: false,
      archivedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 400),
      minStock: 0,
    },
  });

  const store = await prisma.store.findFirst({
    where: { companyId: company.id, isActive: true },
  });
  assert.ok(store, "store");

  const seller = await prisma.user.findFirst({
    where: { companyId: company.id, role: "SELLER", isActive: true },
  });
  assert.ok(seller, "seller");

  const sale = await prisma.sale.create({
    data: {
      storeId: store.id,
      sellerId: seller.id,
      subtotal: 10,
      total: 10,
      status: "COMPLETED",
      items: {
        create: [
          {
            productId: product.id,
            quantity: 1,
            salePrice: 10,
            costPerUnit: 3,
          },
        ],
      },
    },
  });

  const before = await prisma.saleItem.count({ where: { productId: product.id } });
  assert.equal(before, 1, "sale item exists");

  let threw = false;
  try {
    await hardDeleteProductCascade(product.id);
  } catch (e) {
    threw = e instanceof Error && e.message === "PRODUCT_HAS_HISTORY";
  }
  assert.equal(threw, true, "must throw PRODUCT_HAS_HISTORY");

  const afterItems = await prisma.saleItem.count({ where: { productId: product.id } });
  assert.equal(afterItems, 1, "sale history preserved");

  const stillThere = await prisma.product.findUnique({ where: { id: product.id } });
  assert.ok(stillThere, "product not deleted when history exists");

  // cleanup test rows (sale first via cascade of items)
  await prisma.saleItem.deleteMany({ where: { saleId: sale.id } });
  await prisma.sale.delete({ where: { id: sale.id } });
  await hardDeleteProductCascade(product.id);
  const gone = await prisma.product.findUnique({ where: { id: product.id } });
  assert.equal(gone, null, "purge ok without history");

  console.log(JSON.stringify({ ok: true, c2: "PASS" }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
