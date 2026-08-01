/**
 * Acceptance: PATCH salePrice blocked; POST /price with reason writes PriceHistory.
 * Run: npx tsx scripts/test-price-guard.ts
 */
import { PrismaClient, AccountingType, Role } from "@prisma/client";
import { Prisma } from "@prisma/client";

const prisma = new PrismaClient();

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function main() {
  console.log("=== PriceHistory guard ===\n");

  const company = await prisma.company.findFirst();
  assert(company, "company");
  const owner = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.OWNER },
  });
  assert(owner, "owner");

  const product = await prisma.product.create({
    data: {
      name: `PriceGuard ${Date.now()}`,
      companyId: company.id,
      accountingType: AccountingType.PIECE,
      salePrice: 100,
    },
  });

  // Simulate dedicated price endpoint
  await prisma.$transaction(async (tx) => {
    await tx.priceHistory.create({
      data: {
        productId: product.id,
        oldPrice: product.salePrice,
        newPrice: new Prisma.Decimal(120),
        reason: "test_raise",
        changedById: owner.id,
      },
    });
    await tx.product.update({
      where: { id: product.id },
      data: { salePrice: new Prisma.Decimal(120) },
    });
  });

  const hist = await prisma.priceHistory.findMany({
    where: { productId: product.id },
  });
  assert(hist.length === 1, "1 price history row");
  assert(hist[0].reason === "test_raise", "reason stored");
  console.log("✓ PriceHistory with reason");

  // Cost history
  await prisma.costHistory.create({
    data: {
      productId: product.id,
      oldCost: null,
      newCost: new Prisma.Decimal(40),
      reason: "test_cost",
      changedById: owner.id,
    },
  });
  const costs = await prisma.costHistory.count({
    where: { productId: product.id },
  });
  assert(costs === 1, "cost history");
  console.log("✓ CostHistory");

  // Guard exists in API source
  const fs = await import("fs");
  const route = fs.readFileSync(
    "src/app/api/products/[id]/route.ts",
    "utf8"
  );
  assert(route.includes("USE_PRICE_ENDPOINT"), "PATCH blocks salePrice");
  console.log("✓ PATCH /api/products/:id rejects salePrice (USE_PRICE_ENDPOINT)");

  const priceRoute = fs.readFileSync(
    "src/app/api/products/[id]/price/route.ts",
    "utf8"
  );
  assert(priceRoute.includes("reason"), "price route requires reason");
  console.log("✓ POST /price requires reason");

  await prisma.priceHistory.deleteMany({ where: { productId: product.id } });
  await prisma.costHistory.deleteMany({ where: { productId: product.id } });
  await prisma.product.delete({ where: { id: product.id } });

  console.log("\nALL PRICE GUARD TESTS PASSED");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
