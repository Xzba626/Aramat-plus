/**
 * Harizma forensic scenario: zero-stock sale block + duplicate product idempotency.
 * Run: npx tsx scripts/test-harizma-forensic.ts
 */
import {
  PrismaClient,
  AccountingType,
  Role,
  StoreKind,
  LocationType,
} from "@prisma/client";
import { createSale } from "../src/lib/services/sale.service";
import { ensureOwnerDirectStore } from "../src/lib/services/owner-direct.service";
import {
  productCreateFingerprint,
  findRecentProductCreateByFingerprint,
} from "../src/lib/services/product-create.service";

const prisma = new PrismaClient();

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function main() {
  console.log("=== Harizma forensic guards ===\n");

  const company = await prisma.company.findFirst();
  assert(company, "company required for integration tests");
  const owner = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.OWNER },
  });
  assert(owner, "owner");
  const ownerStore = await ensureOwnerDirectStore(company.id);

  const tag = `harizma-${Date.now()}`;

  // ── 1. Product without batch / stock cannot be sold ──
  const product = await prisma.product.create({
    data: {
      name: `харизма ${tag}`,
      companyId: company.id,
      accountingType: AccountingType.PIECE,
      salePrice: 350,
      defaultCostPerUnit: 260,
      minStock: 0,
      sku: `HZ-${tag}`,
    },
  });

  let blocked = false;
  try {
    await createSale({
      companyId: company.id,
      storeId: ownerStore.id,
      sellerId: owner.id,
      items: [{ productId: product.id, quantity: 1 }],
      paymentMethod: "CASH",
    });
  } catch (e) {
    blocked =
      e instanceof Error &&
      (e.message === "INSUFFICIENT_AVAILABLE" ||
        e.message === "INSUFFICIENT_BATCH_STOCK");
  }
  assert(blocked, "sale without batch/stock must be rejected");
  console.log("✓ Sale blocked when product has no warehouse batch/stock");

  // ── 2. Product create fingerprint dedup ──
  const fp = productCreateFingerprint({
    userId: owner.id,
    name: `харизма dup ${tag}`,
    brandId: null,
    categoryId: null,
    accountingType: AccountingType.PIECE,
    salePrice: 350,
    idempotencyKey: `idem-${tag}`,
  });

  const p2 = await prisma.product.create({
    data: {
      name: `харизма dup ${tag}`,
      companyId: company.id,
      accountingType: AccountingType.PIECE,
      salePrice: 350,
      sku: `HZD-${tag}`,
      minStock: 0,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: owner.id,
      companyId: company.id,
      action: "PRODUCT_CREATE",
      entityType: "Product",
      entityId: p2.id,
      comment: p2.name,
      metadata: { createFingerprint: fp, sku: p2.sku },
    },
  });

  const found = await findRecentProductCreateByFingerprint({
    companyId: company.id,
    userId: owner.id,
    fingerprint: fp,
  });
  assert(found?.id === p2.id, "dedup should return recent product by fingerprint");
  console.log("✓ Product create fingerprint dedup finds prior card");

  // cleanup
  await prisma.activityLog.deleteMany({
    where: { entityId: { in: [product.id, p2.id] } },
  });
  await prisma.product.deleteMany({ where: { id: { in: [product.id, p2.id] } } });

  console.log(
    "\nNote: if production sold «харизма» before receipt, compare SaleItem.productId"
  );
  console.log(
    "against Batch.productId — duplicate cards (A/B) explain journal mismatch."
  );
  console.log("\nALL HARIZMA FORENSIC TESTS PASSED");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
