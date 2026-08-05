/**
 * P2#1 Reservation: available qty, race, cancel, expire, complete→sale.
 * Run: npx tsx scripts/test-reservation.ts
 */
import {
  PrismaClient,
  AccountingType,
  Role,
  StoreKind,
  LocationType,
  ReservationStatus,
} from "@prisma/client";
import { addBatch, getQtyAtLocation } from "../src/lib/services/stock.service";
import { createSale } from "../src/lib/services/sale.service";
import {
  createReservation,
  cancelReservation,
  getAvailableQty,
  expireStaleReservations,
  DEFAULT_RESERVATION_TTL_MS,
} from "../src/lib/services/reservation.service";

const prisma = new PrismaClient();

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function main() {
  console.log("=== Reservation: available / race / cancel / expire / complete ===\n");

  const company = await prisma.company.findFirst();
  assert(company, "company");
  const owner = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.OWNER },
  });
  assert(owner, "owner");
  const store = await prisma.store.findFirst({
    where: { companyId: company.id, kind: StoreKind.BRANCH, isActive: true },
  });
  assert(store, "store");
  let seller = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.SELLER, storeId: store.id },
  });
  if (!seller) {
    seller = await prisma.user.findFirst({
      where: { companyId: company.id, role: Role.SELLER },
    });
    if (seller) {
      await prisma.user.update({
        where: { id: seller.id },
        data: { storeId: store.id },
      });
    }
  }
  assert(seller, "seller");

  const product = await prisma.product.create({
    data: {
      name: `Reserve ${Date.now()}`,
      companyId: company.id,
      accountingType: AccountingType.PIECE,
      salePrice: 100,
      minStock: 1,
    },
  });

  await prisma.$transaction(async (tx) => {
    await addBatch(tx, {
      productId: product.id,
      locationType: LocationType.STORE,
      locationId: store.id,
      quantity: 10,
      costPerUnit: 40,
      salePrice: 100,
      notes: "reservation-test",
    });
  });

  let physical = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: store.id,
  });
  assert(physical === 10, `physical 10 got ${physical}`);

  const r1 = await createReservation({
    companyId: company.id,
    storeId: store.id,
    createdById: seller.id,
    items: [{ productId: product.id, quantity: 6 }],
    customerNote: "Instagram hold",
  });
  assert(r1.status === "ACTIVE", "r1 ACTIVE");
  console.log("✓ Create reservation 6");

  let available = await getAvailableQty(prisma, {
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: store.id,
  });
  assert(Number(available) === 4, `available 4 got ${available}`);
  physical = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: store.id,
  });
  assert(physical === 10, `physical still 10 got ${physical}`);
  console.log("✓ Available=4, physical unchanged=10");

  let raceBlocked = false;
  try {
    await createReservation({
      companyId: company.id,
      storeId: store.id,
      createdById: owner.id,
      items: [{ productId: product.id, quantity: 5 }],
    });
  } catch (e) {
    raceBlocked = e instanceof Error && e.message === "INSUFFICIENT_AVAILABLE";
  }
  assert(raceBlocked, "second reserve 5 must fail (only 4 available)");
  console.log("✓ Concurrent over-reserve blocked");

  const walkIn = await createSale({
    companyId: company.id,
    storeId: store.id,
    sellerId: seller.id,
    items: [{ productId: product.id, quantity: 3 }],
  });
  assert(walkIn.id, "walk-in sale");
  physical = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: store.id,
  });
  assert(physical === 7, `physical 7 after walk-in got ${physical}`);
  available = await getAvailableQty(prisma, {
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: store.id,
  });
  assert(Number(available) === 1, `available 1 (7-6) got ${available}`);
  console.log("✓ Walk-in sale respects available (sold 3, reserved 6 remains)");

  await cancelReservation({
    companyId: company.id,
    reservationId: r1.id,
    userId: seller.id,
    asSeller: true,
  });
  available = await getAvailableQty(prisma, {
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: store.id,
  });
  assert(Number(available) === 7, `available 7 after cancel got ${available}`);
  console.log("✓ Cancel restores available");

  const r2 = await createReservation({
    companyId: company.id,
    storeId: store.id,
    createdById: owner.id,
    items: [{ productId: product.id, quantity: 4 }],
    ttlMs: 50,
  });
  await new Promise((r) => setTimeout(r, 80));
  const expiredN = await expireStaleReservations(prisma, company.id);
  assert(expiredN >= 1, "expireStale ran");
  const r2row = await prisma.reservation.findUniqueOrThrow({
    where: { id: r2.id },
  });
  assert(r2row.status === ReservationStatus.EXPIRED, "r2 EXPIRED");
  available = await getAvailableQty(prisma, {
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: store.id,
  });
  assert(Number(available) === 7, `available 7 after expire got ${available}`);
  console.log("✓ TTL expire restores available");

  const r3 = await createReservation({
    companyId: company.id,
    storeId: store.id,
    createdById: seller.id,
    items: [{ productId: product.id, quantity: 2 }],
    ttlMs: DEFAULT_RESERVATION_TTL_MS,
  });
  const saleFromRes = await createSale({
    companyId: company.id,
    storeId: store.id,
    sellerId: seller.id,
    reservationId: r3.id,
    items: [{ productId: product.id, quantity: 2 }],
  });
  const r3row = await prisma.reservation.findUniqueOrThrow({
    where: { id: r3.id },
  });
  assert(r3row.status === ReservationStatus.COMPLETED, "r3 COMPLETED");
  assert(r3row.saleId === saleFromRes.id, "r3 linked to sale");
  physical = await getQtyAtLocation({
    productId: product.id,
    locationType: LocationType.STORE,
    locationId: store.id,
  });
  assert(physical === 5, `physical 5 after complete got ${physical}`);
  console.log("✓ Complete reservation → sale COMPLETED + FIFO deduct");

  const logs = await prisma.activityLog.findMany({
    where: {
      companyId: company.id,
      entityType: "Reservation",
      action: {
        in: [
          "RESERVATION_CREATE",
          "RESERVATION_CANCEL",
          "RESERVATION_COMPLETE",
          "RESERVATION_EXPIRE",
        ],
      },
    },
    take: 20,
    orderBy: { createdAt: "desc" },
  });
  const actions = new Set(logs.map((l) => l.action));
  assert(actions.has("RESERVATION_CREATE"), "log CREATE");
  assert(actions.has("RESERVATION_CANCEL"), "log CANCEL");
  assert(actions.has("RESERVATION_COMPLETE"), "log COMPLETE");
  console.log(`✓ ActivityLog (${[...actions].join(", ")})`);

  // cleanup
  await prisma.reservationItem.deleteMany({
    where: { reservation: { items: { some: { productId: product.id } } } },
  });
  await prisma.reservation.deleteMany({
    where: { items: { some: { productId: product.id } } },
  });
  await prisma.saleItem.deleteMany({ where: { productId: product.id } });
  await prisma.sale.deleteMany({
    where: { items: { some: { productId: product.id } } },
  });
  await prisma.batch.deleteMany({ where: { productId: product.id } });
  await prisma.stockBalance.deleteMany({ where: { productId: product.id } });
  await prisma.product.delete({ where: { id: product.id } });

  console.log("\nALL RESERVATION TESTS PASSED");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
