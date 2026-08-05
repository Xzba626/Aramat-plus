/**
 * Proof: same volume + different name/color/cost → two PackagingSku allowed.
 * Exact duplicate (all fields) → PACKAGING_DUPLICATE.
 * Run: npx tsx scripts/zt-packaging-volume-not-unique-proof.ts
 */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import {
  PackagingDuplicateError,
  createPackagingSku,
} from "../src/lib/services/packaging.service";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Packaging volume-not-unique proof ===\n");
  const company = await prisma.company.findFirst();
  assert.ok(company);
  const owner = await prisma.user.findFirst({
    where: { companyId: company.id, role: "OWNER" },
  });
  assert.ok(owner);

  const stamp = Date.now();
  const classic = await createPackagingSku({
    companyId: company.id,
    actorId: owner.id,
    data: {
      name: `Флакон Classic ${stamp}`,
      volumeMl: 5,
      material: "glass",
      color: "красный",
      defaultCost: 2,
    },
  });
  const premium = await createPackagingSku({
    companyId: company.id,
    actorId: owner.id,
    data: {
      name: `Флакон Premium ${stamp}`,
      volumeMl: 5,
      material: "glass",
      color: "чёрный",
      defaultCost: 3,
    },
  });
  assert.notEqual(classic.sku.id, premium.sku.id);
  assert.equal(Number(classic.sku.volumeMl), 5);
  assert.equal(Number(premium.sku.volumeMl), 5);
  console.log("OK: two 5ml bottles with different name/color/cost");

  await assert.rejects(
    () =>
      createPackagingSku({
        companyId: company.id,
        actorId: owner.id,
        data: {
          name: `Флакон Classic ${stamp}`,
          volumeMl: 5,
          material: "glass",
          color: "красный",
          defaultCost: 2,
        },
      }),
    (err: unknown) => err instanceof PackagingDuplicateError
  );
  console.log("OK: exact duplicate blocked with PACKAGING_DUPLICATE");

  // cleanup
  for (const row of [classic, premium]) {
    await prisma.stockBalance.deleteMany({
      where: { productId: row.product.id },
    });
    await prisma.batch.deleteMany({ where: { productId: row.product.id } });
    await prisma.product.delete({ where: { id: row.product.id } }).catch(() => undefined);
    await prisma.packagingSku.delete({ where: { id: row.sku.id } });
  }
  console.log("\nPASS packaging volume-not-unique");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
