/**
 * Schema Phase assert: Batch.salePrice backfill.
 * Run: npx tsx scripts/zt-batch-sale-price-assert.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const nullProducts = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*)::bigint AS count FROM "Product" WHERE "salePrice" IS NULL
  `;
  const nullBatches = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*)::bigint AS count FROM "Batch" WHERE "salePrice" IS NULL
  `;
  const batchTotal = await prisma.batch.count();
  const withPrice = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*)::bigint AS count FROM "Batch" WHERE "salePrice" IS NOT NULL
  `;

  const np = Number(nullProducts[0].count);
  const nb = Number(nullBatches[0].count);
  const wp = Number(withPrice[0].count);

  console.log("Product.salePrice NULL:", np);
  console.log("Batch.salePrice NULL:", nb);
  console.log("Batch total:", batchTotal);
  console.log("Batch with salePrice:", wp);

  if (np !== 0) throw new Error(`Products without salePrice: ${np}`);
  if (nb !== 0) throw new Error(`Batches without salePrice: ${nb}`);
  if (wp !== batchTotal) throw new Error("Mismatch: not all batches have salePrice");

  console.log("\nPASS batch-sale-price assert (schema phase)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
