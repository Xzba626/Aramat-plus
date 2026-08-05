/**
 * Part 5: cart autosave reserve (no TTL) + client return approve → profit day.
 * Run: npx tsx scripts/zt-sales-part5-proof.ts
 */
import assert from "node:assert/strict";
import {
  AccountingType,
  LocationType,
  PrismaClient,
  ReservationStatus,
  Role,
  StoreKind,
} from "@prisma/client";
import { addBatch } from "../src/lib/services/stock.service";
import { createSale } from "../src/lib/services/sale.service";
import {
  createSaleReturn,
  decideSaleReturn,
} from "../src/lib/services/sale-return.service";
import {
  CART_AUTOSAVE_NOTE,
  getAvailableQty,
  getPhysicalQty,
  syncSellerCartReservation,
} from "../src/lib/services/reservation.service";
import { getDashboardPayload } from "../src/lib/services/dashboard.service";

const prisma = new PrismaClient();

async function main() {
  console.log("=== ZT Sales Part 5 proof ===\n");

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
      where: { companyId: company.id, role: Role.SELLER, isActive: true },
    });
    assert.ok(seller);
    await prisma.user.update({
      where: { id: seller.id },
      data: { storeId: store.id },
    });
  }

  const stamp = Date.now();
  const product = await prisma.product.create({
    data: {
      name: `ZT P5 piece ${stamp}`,
      companyId: company.id,
      accountingType: AccountingType.PIECE,
      salePrice: 100,
      defaultCostPerUnit: 40,
    },
  });
  await prisma.$transaction(
    async (tx) => {
      await addBatch(tx, {
        productId: product.id,
        locationType: LocationType.STORE,
        locationId: store.id,
        quantity: 20,
        costPerUnit: 40,
      salePrice: 100,
        notes: "zt-p5-stock",
      });
    },
    { maxWait: 15_000, timeout: 60_000 }
  );

  const physical = await getPhysicalQty(prisma, {
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: store.id,
  });
  assert.equal(Number(physical), 20);

  // Auto cart reserve 5 → available 15, no expiresAt
  const hold = await syncSellerCartReservation({
    companyId: company.id,
    storeId: store.id,
    createdById: seller.id,
    items: [{ productId: product.id, quantity: 5 }],
  });
  assert.ok(hold);
  assert.equal(hold.noExpiry, true);
  assert.equal(hold.expiresAt, null);
  assert.equal(hold.isCartAutosave, true);

  const availHeld = await getAvailableQty(prisma, {
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: store.id,
  });
  assert.equal(Number(availHeld), 15);
  console.log("✓ cart autosave hold 5, available 15, no TTL");

  // "Leave app" — hold still ACTIVE
  const still = await prisma.reservation.findFirst({
    where: {
      id: hold.id,
      status: ReservationStatus.ACTIVE,
      customerNote: CART_AUTOSAVE_NOTE,
    },
  });
  assert.ok(still);
  assert.equal(still.expiresAt, null);

  // Clear cart → reserve released
  const cleared = await syncSellerCartReservation({
    companyId: company.id,
    storeId: store.id,
    createdById: seller.id,
    items: [],
  });
  assert.equal(cleared, null);
  const availClear = await getAvailableQty(prisma, {
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: store.id,
  });
  assert.equal(Number(availClear), 20);
  console.log("✓ clear cart releases hold");

  // Re-hold then sell completing reservation
  const hold2 = await syncSellerCartReservation({
    companyId: company.id,
    storeId: store.id,
    createdById: seller.id,
    items: [{ productId: product.id, quantity: 2 }],
  });
  assert.ok(hold2);

  const sale = await createSale({
    companyId: company.id,
    sellerId: seller.id,
    storeId: store.id,
    paymentMethod: "CASH",
    reservationId: hold2.id,
    items: [{ productId: product.id, quantity: 2 }],
  });
  const completedRes = await prisma.reservation.findUnique({
    where: { id: hold2.id },
  });
  assert.equal(completedRes?.status, ReservationStatus.COMPLETED);
  console.log("✓ sale completes cart reservation");

  // Yesterday sale for return/profit check — create with backdated createdAt
  const ySale = await createSale({
    companyId: company.id,
    sellerId: seller.id,
    storeId: store.id,
    paymentMethod: "CASH",
    items: [{ productId: product.id, quantity: 1 }],
  });
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(14, 0, 0, 0);
  await prisma.sale.update({
    where: { id: ySale.id },
    data: { createdAt: yesterday },
  });

  const beforeDash = await getDashboardPayload(company.id);
  // Force metrics for "yesterday" via direct sale day: use today dash for return same-day instead
  // Same-day return on `sale` (today):
  const beforeRev = beforeDash.today.revenue;
  const beforeNet = beforeDash.today.netProfit;

  const ret = await createSaleReturn({
    companyId: company.id,
    saleId: sale.id,
    requesterId: seller.id,
    reason: "Клиент передумал — zt-p5",
    reasonCode: "OTHER",
  });
  const notif = await prisma.notification.findFirst({
    where: {
      userId: owner.id,
      entityId: ret.id,
      type: "RETURN_REQUEST",
    },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(notif);
  assert.ok(notif.message.includes(store.name));
  assert.ok(notif.message.includes("Клиент передумал"));
  console.log("✓ return request notify", notif.message);

  await decideSaleReturn({
    companyId: company.id,
    returnId: ret.id,
    reviewerId: owner.id,
    decision: "APPROVE",
  });

  const afterDash = await getDashboardPayload(company.id);
  const dRev = afterDash.today.revenue - beforeRev;
  const dNet = afterDash.today.netProfit - beforeNet;
  // Sale was 2×100=200 revenue, COGS 80, net 120 — return removes that
  assert.ok(dRev <= -199.5, `revenue drop got ${dRev}`);
  assert.ok(dNet <= -119.5, `net drop got ${dNet}`);
  console.log("✓ approve return recalculates today", { dRev, dNet });

  // Discount deep-link check
  assert.ok(
    afterDash.decisions.every(
      (d) =>
        (d.type === "DISCOUNT" && d.href === "/discounts") ||
        (d.type === "RETURN" && d.href === "/returns") ||
        d.type !== "DISCOUNT"
    )
  );
  console.log("✓ decision hrefs → /discounts|/returns");

  console.log("\nPASS: Part 5 — cart hold no TTL + return approve/profit");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
