/**
 * Product logical duplicate protection + legitimate variant separation.
 * Run: npx tsx scripts/test-product-integrity.ts
 */
import { loadProjectEnv } from "./forensic-lab/lib/load-env";
loadProjectEnv();

import { PrismaClient, AccountingType } from "@prisma/client";
import assert from "node:assert/strict";
import { assertForensicOrStressSafe } from "../src/lib/db-safety-guard";
import { resetLocalDatabase } from "./forensic-lab/lib/reset";
import { loadLabContext, createProductFlow, disconnectFlows } from "./forensic-lab/lib/app-flows";
import { findLogicalDuplicateProduct } from "../src/lib/services/product-create.service";

const prisma = new PrismaClient();

async function main() {
  assertForensicOrStressSafe("test-product-integrity");
  resetLocalDatabase("product-integrity");
  console.log("=== Product integrity audit ===\n");

  const ctx = await loadLabContext();

  const harizmaA = await createProductFlow(ctx, {
    name: "Harizma",
    sku: "HAR-A",
    accountingType: AccountingType.PIECE,
    salePrice: 100,
    defaultCostPerUnit: 40,
  });
  const harizmaB = await createProductFlow(ctx, {
    name: "Harizma",
    sku: "HAR-B",
    accountingType: AccountingType.PIECE,
    salePrice: 120,
    defaultCostPerUnit: 45,
  });
  assert.notEqual(harizmaA.product.id, harizmaB.product.id);
  console.log("✓ Same name, different SKU → two products");

  const dupSku = await findLogicalDuplicateProduct({
    companyId: ctx.companyId,
    name: "Harizma Copy",
    accountingType: AccountingType.PIECE,
    unitId: harizmaA.product.unitId ?? "",
    sku: "HAR-A",
  });
  assert.ok(dupSku, "duplicate SKU detected");
  console.log("✓ Duplicate SKU blocked by findLogicalDuplicateProduct");

  const base = await prisma.product.create({
    data: {
      companyId: ctx.companyId,
      name: "UniqueNoSku",
      accountingType: AccountingType.PIECE,
      salePrice: 50,
      sku: null,
      minStock: 0,
    },
  });
  const dupLogical = await findLogicalDuplicateProduct({
    companyId: ctx.companyId,
    name: "UniqueNoSku",
    accountingType: AccountingType.PIECE,
    unitId: base.unitId ?? "",
    brandId: base.brandId ?? null,
    categoryId: base.categoryId ?? null,
  });
  assert.ok(dupLogical, "same name+unit without sku is duplicate");
  console.log("✓ Logical duplicate (no SKU) detected");

  const count = await prisma.product.count({ where: { companyId: ctx.companyId } });
  assert.ok(count >= 3);
  console.log("\n✓ Product integrity audit passed");
  await prisma.$disconnect();
  await disconnectFlows();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
