/**
 * Discount integrity: exceeds total, below COGS, partial return prorate, snapshots.
 * Run: npx tsx scripts/test-discount-integrity.ts
 */
import { loadProjectEnv } from "./forensic-lab/lib/load-env";
loadProjectEnv();

import {
  PrismaClient,
  AccountingType,
  StoreKind,
  LocationType,
} from "@prisma/client";
import assert from "node:assert/strict";
import { assertForensicOrStressSafe } from "../src/lib/db-safety-guard";
import { resetLocalDatabase } from "./forensic-lab/lib/reset";
import {
  loadLabContext,
  createProductFlow,
  saleFlow,
  returnAndApproveFlow,
  disconnectFlows,
} from "./forensic-lab/lib/app-flows";
import { createSale } from "../src/lib/services/sale.service";
import {
  computeDiscountEconomics,
  assertDiscountWithinSubtotal,
  assertSaleRiskConfirmation,
} from "../src/lib/services/discount-economics.service";
import {
  saleGrossMetricsNetOfReturnsSync,
  loadApprovedReturnLines,
} from "../src/lib/services/profit.service";
import { computeRawFinancials } from "./forensic-lab/lib/independent-calculator";
import { decimalToNumber } from "../src/lib/utils";

const prisma = new PrismaClient();

async function main() {
  assertForensicOrStressSafe("test-discount-integrity");
  resetLocalDatabase("discount-integrity");
  console.log("=== Discount integrity audit ===\n");

  const ctx = await loadLabContext();
  const storeId = ctx.ownerDirectStoreId;

  // A: normal discount
  const econA = computeDiscountEconomics({
    subtotal: 250,
    discount: 50,
    cogs: 100,
  });
  assert.equal(econA.finalRevenue, 200);
  assert.equal(econA.grossProfit, 100);
  console.log("✓ A normal discount economics");

  // B: break-even
  const econB = computeDiscountEconomics({
    subtotal: 250,
    discount: 150,
    cogs: 100,
  });
  assert.equal(econB.grossProfit, 0);
  console.log("✓ B break-even at COGS");

  // C: below COGS (owner allowed at service level)
  const econC = computeDiscountEconomics({
    subtotal: 250,
    discount: 151,
    cogs: 100,
  });
  assert.equal(econC.finalRevenue, 99);
  assert.equal(econC.grossProfit, -1);
  assert.equal(econC.belowCost, true);
  console.log("✓ C below COGS detected");

  // E: discount > price rejected
  assert.throws(
    () => assertDiscountWithinSubtotal(250, 251),
    (e: Error) => e.message === "DISCOUNT_EXCEEDS_TOTAL"
  );
  console.log("✓ E discount > subtotal rejected");

  const { product } = await createProductFlow(ctx, {
    name: "DISC-INT",
    sku: "DISC-INT-1",
    accountingType: AccountingType.WEIGHT,
    salePrice: 13.4,
    defaultCostPerUnit: 4,
    initialQuantity: 100,
  });

  // Owner sale with discount 36 on 536 subtotal (40ml)
  const sale = await saleFlow(ctx, {
    storeId,
    sellerId: ctx.ownerId,
    productId: product.id,
    quantity: 40,
    accountingType: AccountingType.WEIGHT,
    discountAmount: 36,
  });
  assert.equal(decimalToNumber(sale.total), 500);
  console.log("✓ Owner sale with discount persisted");

  // API reject discount > subtotal (after stock/FIFO — use small qty)
  let rejectCode = "";
  try {
    await createSale({
      companyId: ctx.companyId,
      storeId,
      sellerId: ctx.ownerId,
      items: [
        {
          productId: product.id,
          quantity: 5,
          containerSource: "CUSTOMER_BOTTLE",
        },
      ],
      discountAmount: 99999,
    });
  } catch (e) {
    rejectCode = e instanceof Error ? e.message : String(e);
  }
  assert.equal(rejectCode, "DISCOUNT_EXCEEDS_TOTAL");
  console.log("✓ Service rejects discount > subtotal");

  // Server-side below-COGS confirmation (actual FIFO COGS inside transaction)
  const { product: lossProd } = await createProductFlow(ctx, {
    name: "LOSS-SALE",
    sku: "LOSS-SALE-1",
    accountingType: AccountingType.PIECE,
    salePrice: 250,
    defaultCostPerUnit: 100,
    initialQuantity: 5,
  });

  let belowCostReject = "";
  try {
    await createSale({
      companyId: ctx.companyId,
      storeId,
      sellerId: ctx.ownerId,
      items: [{ productId: lossProd.id, quantity: 1 }],
      discountAmount: 151,
    });
  } catch (e) {
    belowCostReject = e instanceof Error ? e.message : String(e);
  }
  assert.equal(
    belowCostReject,
    "BELOW_COST_CONFIRMATION_REQUIRED",
    "owner below-COGS without confirm rejected"
  );

  const lossSale = await createSale({
    companyId: ctx.companyId,
    storeId,
    sellerId: ctx.ownerId,
    items: [{ productId: lossProd.id, quantity: 1 }],
    discountAmount: 151,
    confirmBelowCost: true,
  });
  assert.equal(decimalToNumber(lossSale.total), 99);
  const lossItem = await prisma.saleItem.findFirstOrThrow({
    where: { saleId: lossSale.id },
  });
  assert.equal(decimalToNumber(lossItem.costPerUnit), 100);
  console.log("✓ Below-COGS requires confirmBelowCost; actual FIFO COGS in snapshot");

  assert.throws(
    () =>
      assertSaleRiskConfirmation({
        subtotal: 250,
        discount: 151,
        actualCogs: 100,
        requiresOwnerConfirmation: false,
        approvedDiscountRequest: false,
      }),
    (e: Error) => e.message === "SALE_BELOW_COST_NOT_ALLOWED"
  );
  console.log("✓ Non-owner direct path blocked for below-COGS");

  // H: partial return after discount
  const full = await prisma.sale.findUniqueOrThrow({
    where: { id: sale.id },
    include: { items: true },
  });
  await returnAndApproveFlow(ctx, {
    saleId: sale.id,
    saleItemId: full.items[0]!.id,
    quantity: 10,
  });

  const sales = await prisma.sale.findMany({
    where: { storeId, status: { in: ["COMPLETED", "PARTIAL_RETURN"] } },
    include: { items: true },
  });
  const retLines = await loadApprovedReturnLines(sales.map((s) => s.id));
  const app = saleGrossMetricsNetOfReturnsSync(sales, retLines);
  const raw = await computeRawFinancials({ companyId: ctx.companyId, storeId });
  assert.ok(Math.abs(app.revenue - raw.revenue) < 0.06);
  assert.ok(Math.abs(app.cogs - raw.cogs) < 0.06);
  console.log(`✓ H partial return after discount rev=${app.revenue} cogs=${app.cogs}`);

  // K: price change does not alter historical sale
  await prisma.product.update({
    where: { id: product.id },
    data: { salePrice: 999, defaultCostPerUnit: 888 },
  });
  const frozen = await prisma.saleItem.findFirstOrThrow({
    where: { saleId: sale.id },
  });
  assert.ok(Math.abs(decimalToNumber(frozen.salePrice) - 13.4) < 0.01);
  assert.ok(Math.abs(decimalToNumber(frozen.costPerUnit) - 4) < 0.01);
  console.log("✓ K historical SaleItem snapshot unchanged");

  console.log("\n✓ Discount integrity audit passed");
  await prisma.$disconnect();
  await disconnectFlows();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
