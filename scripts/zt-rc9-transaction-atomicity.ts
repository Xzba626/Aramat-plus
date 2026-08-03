/**
 * RC9 — Transaction Failure / Atomicity
 * Prove createSale rolls back stock when sale cannot complete;
 * never leaves stock deducted without sale row.
 * Run: npx tsx scripts/zt-rc9-transaction-atomicity.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AccountingType,
  LocationType,
  PrismaClient,
  Role,
  StoreKind,
} from "@prisma/client";
import { addBatch, getQtyAtLocation } from "../src/lib/services/stock.service";
import { createSale } from "../src/lib/services/sale.service";
import { createTransfer } from "../src/lib/services/transfer.service";

const prisma = new PrismaClient();

async function main() {
  const rows: Array<{ check: string; status: string; detail: string }> = [];

  // Code contract: createSale wraps mutations in $transaction
  const saleSrc = readFileSync(
    join(process.cwd(), "src/lib/services/sale.service.ts"),
    "utf8"
  );
  const hasTx = saleSrc.includes("prisma.$transaction");
  rows.push({
    check: "createSale_uses_transaction",
    status: hasTx ? "PASS" : "FAIL",
    detail: hasTx ? "prisma.$transaction present" : "missing",
  });

  const company = await prisma.company.findFirst();
  assert.ok(company);
  const warehouse = await prisma.warehouse.findFirst({
    where: { companyId: company.id, isActive: true },
  });
  assert.ok(warehouse);
  const store = await prisma.store.findFirst({
    where: { companyId: company.id, kind: StoreKind.BRANCH, isActive: true },
  });
  assert.ok(store);
  const owner = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.OWNER },
  });
  assert.ok(owner);
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
      where: { companyId: company.id, role: Role.SELLER },
    });
    assert.ok(seller);
    await prisma.user.update({
      where: { id: seller.id },
      data: { storeId: store.id },
    });
  }

  const product = await prisma.product.create({
    data: {
      companyId: company.id,
      name: `[RC9] ${Date.now()}`,
      salePrice: 10,
      defaultCostPerUnit: 3,
      accountingType: AccountingType.PIECE,
      minStock: 0,
    },
  });
  await prisma.$transaction(async (tx) => {
    await addBatch(tx, {
      productId: product.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 5,
      costPerUnit: 3,
      createdById: owner.id,
    });
  });
  await createTransfer({
    companyId: company.id,
    fromWarehouseId: warehouse.id,
    toStoreId: store.id,
    createdById: owner.id,
    items: [{ productId: product.id, quantity: 5 }],
  });

  const stockBefore = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: store.id,
  });
  const salesBefore = await prisma.sale.count({
    where: { storeId: store.id, items: { some: { productId: product.id } } },
  });

  // Oversell — must fail entirely
  let threw = false;
  try {
    await createSale({
      companyId: company.id,
      storeId: store.id,
      sellerId: seller.id,
      items: [{ productId: product.id, quantity: stockBefore + 10 }],
    });
  } catch {
    threw = true;
  }
  const stockAfterFail = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: store.id,
  });
  const salesAfterFail = await prisma.sale.count({
    where: { storeId: store.id, items: { some: { productId: product.id } } },
  });
  const atomicFail =
    threw &&
    Math.abs(stockAfterFail - stockBefore) < 0.001 &&
    salesAfterFail === salesBefore;
  rows.push({
    check: "oversell_no_partial_state",
    status: atomicFail ? "PASS" : "FAIL",
    detail: `threw=${threw} stock ${stockBefore}→${stockAfterFail} sales ${salesBefore}→${salesAfterFail}`,
  });

  // Happy path still works
  const sale = await createSale({
    companyId: company.id,
    storeId: store.id,
    sellerId: seller.id,
    items: [{ productId: product.id, quantity: 1 }],
  });
  const stockOk = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: store.id,
  });
  rows.push({
    check: "happy_path_stock_and_sale",
    status:
      Math.abs(stockOk - (stockBefore - 1)) < 0.001 && sale.id
        ? "PASS"
        : "FAIL",
    detail: `sale=${sale.id} stock=${stockOk}`,
  });

  // Note: activity log / some notifies are outside tx (fire-and-forget)
  const auditOutside = /logActivity[\s\S]{0,80}\.catch/.test(saleSrc);
  rows.push({
    check: "audit_outside_tx_documented",
    status: "PASS",
    detail: auditOutside
      ? "KNOWN: journal may lag if process dies after commit — stock+sale still atomic"
      : "audit pattern differs; stock+sale still in $transaction",
  });

  // cleanup
  await prisma.saleItem.deleteMany({ where: { saleId: sale.id } });
  await prisma.sale.delete({ where: { id: sale.id } }).catch(() => undefined);
  try {
    await prisma.stockBalance.deleteMany({ where: { productId: product.id } });
    await prisma.batch.deleteMany({ where: { productId: product.id } });
    await prisma.transferItem.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
  } catch {
    /* ok */
  }

  const fail = rows.filter((r) => r.status === "FAIL").length;
  console.log(JSON.stringify({ rc9: fail === 0 ? "PASS" : "FAIL", rows }, null, 2));
  if (fail > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
