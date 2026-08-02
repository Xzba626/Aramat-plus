/**
 * Stock reservations: available = physical − ACTIVE (non-expired).
 * Does NOT mutate Batch / StockBalance until sale (FIFO via stock.service).
 * Cart autosave: no TTL — held until sale complete or cancel.
 */
import {
  LocationType,
  Prisma,
  ReservationStatus,
  StoreKind,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/services/activity-log.service";
import { decimalToNumber } from "@/lib/utils";

/** @deprecated Cart holds have no TTL; kept for optional legacy manual TTL. */
export const DEFAULT_RESERVATION_TTL_MS = 30 * 60 * 1000;

/** Marker in customerNote for auto-synced POS cart holds. */
export const CART_AUTOSAVE_NOTE = "__cart_autosave__";

export type ReservationLineInput = {
  productId: string;
  quantity: number;
};

type Tx = Prisma.TransactionClient;

/** ACTIVE and not past expiresAt (null expiresAt = never expires). */
function activeReservationWhere(
  extra: Prisma.ReservationWhereInput = {}
): Prisma.ReservationWhereInput {
  const now = new Date();
  return {
    status: ReservationStatus.ACTIVE,
    AND: [
      {
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    ],
    ...extra,
  };
}

function isExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() <= Date.now();
}

/** Mark ACTIVE past expiresAt as EXPIRED (legacy TTL rows only). */
export async function expireStaleReservations(
  tx: Tx | typeof prisma = prisma,
  companyId?: string
) {
  const now = new Date();
  const where: Prisma.ReservationWhereInput = {
    status: ReservationStatus.ACTIVE,
    expiresAt: { not: null, lt: now },
    ...(companyId ? { companyId } : {}),
  };
  const stale = await tx.reservation.findMany({
    where,
    select: { id: true, companyId: true },
    take: 200,
  });
  if (!stale.length) return 0;

  await tx.reservation.updateMany({
    where: { id: { in: stale.map((s) => s.id) } },
    data: { status: ReservationStatus.EXPIRED },
  });

  if (tx === prisma) {
    for (const row of stale) {
      void logActivity({
        companyId: row.companyId,
        action: "RESERVATION_EXPIRE",
        entityType: "Reservation",
        entityId: row.id,
      }).catch(() => undefined);
    }
  }
  return stale.length;
}

async function lockStockBalanceRow(
  tx: Tx,
  productId: string,
  locationType: LocationType,
  locationId: string
) {
  await tx.$queryRaw`
    SELECT id FROM "StockBalance"
    WHERE "productId" = ${productId}
      AND "locationType" = CAST(${locationType} AS "LocationType")
      AND "locationId" = ${locationId}
    FOR UPDATE
  `;
}

/** Sum ACTIVE reservation qty at location (optionally exclude one reservation). */
export async function sumReservedQty(
  tx: Tx | typeof prisma,
  params: {
    productId: string;
    locationType: LocationType;
    locationId: string;
    excludeReservationId?: string;
  }
) {
  const items = await tx.reservationItem.findMany({
    where: {
      productId: params.productId,
      reservation: activeReservationWhere({
        locationType: params.locationType,
        locationId: params.locationId,
        ...(params.excludeReservationId
          ? { id: { not: params.excludeReservationId } }
          : {}),
      }),
    },
    select: { quantity: true },
  });
  return items.reduce(
    (s, i) => s.add(i.quantity),
    new Prisma.Decimal(0)
  );
}

export async function getPhysicalQty(
  tx: Tx | typeof prisma,
  params: {
    productId: string;
    locationType: LocationType;
    locationId: string;
  }
) {
  const bal = await tx.stockBalance.findUnique({
    where: {
      productId_locationType_locationId: {
        productId: params.productId,
        locationType: params.locationType,
        locationId: params.locationId,
      },
    },
    select: { quantity: true },
  });
  return bal?.quantity ?? new Prisma.Decimal(0);
}

export async function getAvailableQty(
  tx: Tx | typeof prisma,
  params: {
    productId: string;
    locationType: LocationType;
    locationId: string;
    excludeReservationId?: string;
  }
) {
  const physical = await getPhysicalQty(tx, params);
  const reserved = await sumReservedQty(tx, params);
  const available = physical.sub(reserved);
  return available.lt(0) ? new Prisma.Decimal(0) : available;
}

/** Map productId → reserved ACTIVE qty at location. */
export async function reservedQtyByProduct(params: {
  companyId: string;
  locationType: LocationType;
  locationId: string;
  productIds?: string[];
}) {
  await expireStaleReservations(prisma, params.companyId);
  const items = await prisma.reservationItem.findMany({
    where: {
      ...(params.productIds?.length
        ? { productId: { in: params.productIds } }
        : {}),
      reservation: activeReservationWhere({
        companyId: params.companyId,
        locationType: params.locationType,
        locationId: params.locationId,
      }),
    },
    select: { productId: true, quantity: true },
  });
  const map = new Map<string, number>();
  for (const it of items) {
    map.set(
      it.productId,
      (map.get(it.productId) ?? 0) + decimalToNumber(it.quantity)
    );
  }
  return map;
}

async function resolveSaleLocation(params: {
  companyId: string;
  storeId: string;
}): Promise<{ locationType: LocationType; locationId: string; storeName: string; kind: StoreKind }> {
  const store = await prisma.store.findFirst({
    where: {
      id: params.storeId,
      companyId: params.companyId,
      isActive: true,
      isArchived: false,
    },
    select: { id: true, name: true, kind: true },
  });
  if (!store) throw new Error("STORE_NOT_FOUND");

  if (store.kind === StoreKind.OWNER_DIRECT) {
    const warehouse = await prisma.warehouse.findFirst({
      where: { companyId: params.companyId, isActive: true },
      select: { id: true },
    });
    if (!warehouse) throw new Error("WAREHOUSE_MISSING");
    return {
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      storeName: store.name,
      kind: store.kind,
    };
  }
  return {
    locationType: LocationType.STORE,
    locationId: store.id,
    storeName: store.name,
    kind: store.kind,
  };
}

function serializeReservation(
  r: {
    id: string;
    status: ReservationStatus;
    expiresAt: Date | null;
    customerNote: string | null;
    createdAt: Date;
    updatedAt: Date;
    storeId: string;
    locationType: LocationType;
    locationId: string;
    saleId: string | null;
    store?: { id: string; name: string };
    createdBy?: { id: string; name: string };
    items: Array<{
      id: string;
      productId: string;
      quantity: Prisma.Decimal;
      product?: { id: string; name: string; salePrice?: Prisma.Decimal };
    }>;
  }
) {
  return {
    id: r.id,
    status: r.status,
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    noExpiry: r.expiresAt == null,
    isCartAutosave: r.customerNote === CART_AUTOSAVE_NOTE,
    customerNote:
      r.customerNote === CART_AUTOSAVE_NOTE ? null : r.customerNote,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    storeId: r.storeId,
    locationType: r.locationType,
    locationId: r.locationId,
    saleId: r.saleId,
    store: r.store,
    createdBy: r.createdBy,
    items: r.items.map((it) => ({
      id: it.id,
      productId: it.productId,
      quantity: decimalToNumber(it.quantity),
      product: it.product
        ? {
            id: it.product.id,
            name: it.product.name,
            salePrice: it.product.salePrice
              ? decimalToNumber(it.product.salePrice)
              : undefined,
          }
        : undefined,
    })),
  };
}

export async function createReservation(params: {
  companyId: string;
  storeId: string;
  createdById: string;
  items: ReservationLineInput[];
  customerNote?: string;
  ttlMs?: number;
}) {
  if (!params.items.length) throw new Error("EMPTY_CART");
  for (const line of params.items) {
    if (!(line.quantity > 0)) throw new Error("QTY_MUST_BE_POSITIVE");
  }

  const merged = new Map<string, number>();
  for (const line of params.items) {
    merged.set(
      line.productId,
      (merged.get(line.productId) ?? 0) + line.quantity
    );
  }
  const lines = [...merged.entries()].map(([productId, quantity]) => ({
    productId,
    quantity,
  }));

  const creator = await prisma.user.findFirst({
    where: {
      id: params.createdById,
      companyId: params.companyId,
      isActive: true,
    },
    select: { id: true, role: true, storeId: true, name: true },
  });
  if (!creator) throw new Error("USER_NOT_FOUND");
  if (creator.role === "SELLER") {
    if (!creator.storeId || creator.storeId !== params.storeId) {
      throw new Error("SELLER_WRONG_STORE");
    }
  }

  const loc = await resolveSaleLocation({
    companyId: params.companyId,
    storeId: params.storeId,
  });

  const productIds = lines.map((l) => l.productId);
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      companyId: params.companyId,
      isActive: true,
    },
    select: { id: true, name: true, salePrice: true },
  });
  if (products.length !== productIds.length) throw new Error("PRODUCT_NOT_FOUND");

  const expiresAt =
    params.ttlMs != null && params.ttlMs > 0
      ? new Date(Date.now() + params.ttlMs)
      : null;

  const reservation = await prisma.$transaction(
    async (tx) => {
      await expireStaleReservations(tx, params.companyId);

      for (const line of lines) {
        await lockStockBalanceRow(
          tx,
          line.productId,
          loc.locationType,
          loc.locationId
        );
        const available = await getAvailableQty(tx, {
          productId: line.productId,
          locationType: loc.locationType,
          locationId: loc.locationId,
        });
        if (available.lt(line.quantity)) {
          throw new Error("INSUFFICIENT_AVAILABLE");
        }
      }

      const created = await tx.reservation.create({
        data: {
          companyId: params.companyId,
          storeId: params.storeId,
          locationType: loc.locationType,
          locationId: loc.locationId,
          status: ReservationStatus.ACTIVE,
          expiresAt,
          createdById: params.createdById,
          customerNote: params.customerNote?.trim() || null,
          items: {
            create: lines.map((l) => ({
              productId: l.productId,
              quantity: new Prisma.Decimal(l.quantity),
            })),
          },
        },
        include: {
          store: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, salePrice: true } },
            },
          },
        },
      });

      await logActivity({
        tx,
        userId: params.createdById,
        companyId: params.companyId,
        action: "RESERVATION_CREATE",
        entityType: "Reservation",
        entityId: created.id,
        comment: `${loc.storeName} · ${lines.length} SKU · hold until sale/cancel`,
        metadata: {
          storeId: params.storeId,
          locationType: loc.locationType,
          locationId: loc.locationId,
          expiresAt: expiresAt?.toISOString() ?? null,
          items: lines,
        },
      });

      return created;
    },
    { maxWait: 8000, timeout: 20000 }
  );

  return serializeReservation(reservation);
}

export async function cancelReservation(params: {
  companyId: string;
  reservationId: string;
  userId: string;
  asSeller?: boolean;
}) {
  const reservation = await prisma.$transaction(
    async (tx) => {
      await expireStaleReservations(tx, params.companyId);

      const row = await tx.reservation.findFirst({
        where: { id: params.reservationId, companyId: params.companyId },
        include: {
          store: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, salePrice: true } },
            },
          },
        },
      });
      if (!row) throw new Error("NOT_FOUND");
      if (params.asSeller && row.createdById !== params.userId) {
        throw new Error("FORBIDDEN");
      }
      if (row.status !== ReservationStatus.ACTIVE) {
        throw new Error("RESERVATION_NOT_ACTIVE");
      }
      if (isExpired(row.expiresAt)) {
        await tx.reservation.update({
          where: { id: row.id },
          data: { status: ReservationStatus.EXPIRED },
        });
        throw new Error("RESERVATION_EXPIRED");
      }

      const updated = await tx.reservation.update({
        where: { id: row.id },
        data: { status: ReservationStatus.CANCELLED },
        include: {
          store: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, salePrice: true } },
            },
          },
        },
      });

      await logActivity({
        tx,
        userId: params.userId,
        companyId: params.companyId,
        action: "RESERVATION_CANCEL",
        entityType: "Reservation",
        entityId: row.id,
        comment: row.store.name,
      });

      return updated;
    },
    { maxWait: 5000, timeout: 15000 }
  );

  return serializeReservation(reservation);
}

export async function listReservations(params: {
  companyId: string;
  storeId?: string;
  status?: ReservationStatus | "ACTIVE_ONLY";
  createdById?: string;
  limit?: number;
}) {
  await expireStaleReservations(prisma, params.companyId);

  const statusFilter =
    params.status === "ACTIVE_ONLY"
      ? ReservationStatus.ACTIVE
      : params.status;

  const rows = await prisma.reservation.findMany({
    where: {
      companyId: params.companyId,
      ...(params.storeId ? { storeId: params.storeId } : {}),
      ...(params.status === "ACTIVE_ONLY"
        ? activeReservationWhere()
        : statusFilter
          ? { status: statusFilter }
          : {}),
      ...(params.createdById ? { createdById: params.createdById } : {}),
    },
    include: {
      store: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      items: {
        include: {
          product: { select: { id: true, name: true, salePrice: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(params.limit ?? 50, 100),
  });

  return rows.map(serializeReservation);
}

/**
 * Assert reservation can be completed by this sale (inside TX).
 * Returns locked reservation rows; caller marks COMPLETED after sale create.
 */
export async function assertReservationForSale(
  tx: Tx,
  params: {
    companyId: string;
    reservationId: string;
    storeId: string;
    sellerId: string;
    items: ReservationLineInput[];
    sellerIsRestricted?: boolean;
  }
) {
  await expireStaleReservations(tx, params.companyId);

  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Reservation"
    WHERE id = ${params.reservationId}
      AND "companyId" = ${params.companyId}
    FOR UPDATE
  `;
  if (!rows.length) throw new Error("RESERVATION_NOT_FOUND");

  const reservation = await tx.reservation.findFirst({
    where: { id: params.reservationId, companyId: params.companyId },
    include: { items: true },
  });
  if (!reservation) throw new Error("RESERVATION_NOT_FOUND");
  if (reservation.storeId !== params.storeId) {
    throw new Error("RESERVATION_WRONG_STORE");
  }
  if (
    params.sellerIsRestricted &&
    reservation.createdById !== params.sellerId
  ) {
    throw new Error("FORBIDDEN");
  }
  if (reservation.status !== ReservationStatus.ACTIVE) {
    throw new Error("RESERVATION_NOT_ACTIVE");
  }
  if (isExpired(reservation.expiresAt)) {
    await tx.reservation.update({
      where: { id: reservation.id },
      data: { status: ReservationStatus.EXPIRED },
    });
    throw new Error("RESERVATION_EXPIRED");
  }

  const need = new Map<string, number>();
  for (const line of params.items) {
    need.set(
      line.productId,
      (need.get(line.productId) ?? 0) + line.quantity
    );
  }
  const held = new Map(
    reservation.items.map((i) => [i.productId, decimalToNumber(i.quantity)])
  );
  for (const [productId, qty] of need) {
    const h = held.get(productId) ?? 0;
    if (qty > h + 1e-9) throw new Error("RESERVATION_QTY_MISMATCH");
  }
  // Sale must not introduce products outside reservation
  for (const productId of need.keys()) {
    if (!held.has(productId)) throw new Error("RESERVATION_QTY_MISMATCH");
  }

  return reservation;
}

export async function completeReservationInTx(
  tx: Tx,
  params: {
    reservationId: string;
    saleId: string;
    userId: string;
    companyId: string;
  }
) {
  await tx.reservation.update({
    where: { id: params.reservationId },
    data: {
      status: ReservationStatus.COMPLETED,
      saleId: params.saleId,
    },
  });
  await logActivity({
    tx,
    userId: params.userId,
    companyId: params.companyId,
    action: "RESERVATION_COMPLETE",
    entityType: "Reservation",
    entityId: params.reservationId,
    comment: params.saleId,
    metadata: { saleId: params.saleId },
  });
}

/**
 * Before FIFO deduct for a walk-in sale (no reservation): ensure available covers qty.
 * With reservationId: only check available for qty beyond that reservation's hold
 * (held qty is already ours — physical still covers via invariant).
 */
export async function assertAvailableForSaleLines(
  tx: Tx,
  params: {
    locationType: LocationType;
    locationId: string;
    items: ReservationLineInput[];
    reservationId?: string;
  }
) {
  const need = new Map<string, number>();
  for (const line of params.items) {
    need.set(
      line.productId,
      (need.get(line.productId) ?? 0) + line.quantity
    );
  }

  for (const [productId, qty] of need) {
    await lockStockBalanceRow(
      tx,
      productId,
      params.locationType,
      params.locationId
    );

    if (params.reservationId) {
      // Physical must cover sale; reserved-by-others must leave room after our hold
      const physical = await getPhysicalQty(tx, {
        productId,
        locationType: params.locationType,
        locationId: params.locationId,
      });
      const others = await sumReservedQty(tx, {
        productId,
        locationType: params.locationType,
        locationId: params.locationId,
        excludeReservationId: params.reservationId,
      });
      // Our reservation holds some qty; after sale physical drops by qty.
      // Require: physical - others >= qty  (our hold is part of physical, not "others")
      if (physical.sub(others).lt(qty)) {
        throw new Error("INSUFFICIENT_AVAILABLE");
      }
    } else {
      const available = await getAvailableQty(tx, {
        productId,
        locationType: params.locationType,
        locationId: params.locationId,
      });
      if (available.lt(qty)) {
        throw new Error("INSUFFICIENT_AVAILABLE");
      }
    }
  }
}

/**
 * Upsert POS cart hold for seller+store. Empty cart cancels existing autosave.
 * No TTL — held until sale completes or cart is cleared.
 */
export async function syncSellerCartReservation(params: {
  companyId: string;
  storeId: string;
  createdById: string;
  items: ReservationLineInput[];
}) {
  const existing = await prisma.reservation.findFirst({
    where: activeReservationWhere({
      companyId: params.companyId,
      storeId: params.storeId,
      createdById: params.createdById,
      customerNote: CART_AUTOSAVE_NOTE,
    }),
    include: {
      store: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      items: {
        include: {
          product: { select: { id: true, name: true, salePrice: true } },
        },
      },
    },
  });

  const merged = new Map<string, number>();
  for (const line of params.items) {
    if (!(line.quantity > 0)) continue;
    merged.set(
      line.productId,
      (merged.get(line.productId) ?? 0) + line.quantity
    );
  }
  const lines = [...merged.entries()].map(([productId, quantity]) => ({
    productId,
    quantity,
  }));

  if (lines.length === 0) {
    if (existing) {
      await prisma.reservation.update({
        where: { id: existing.id },
        data: { status: ReservationStatus.CANCELLED },
      });
      await logActivity({
        userId: params.createdById,
        companyId: params.companyId,
        action: "RESERVATION_CANCEL",
        entityType: "Reservation",
        entityId: existing.id,
        comment: "cart cleared",
      });
    }
    return null;
  }

  const loc = await resolveSaleLocation({
    companyId: params.companyId,
    storeId: params.storeId,
  });

  const productIds = lines.map((l) => l.productId);
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      companyId: params.companyId,
      isActive: true,
    },
    select: { id: true },
  });
  if (products.length !== productIds.length) throw new Error("PRODUCT_NOT_FOUND");

  return prisma.$transaction(
    async (tx) => {
      await expireStaleReservations(tx, params.companyId);

      for (const line of lines) {
        await lockStockBalanceRow(
          tx,
          line.productId,
          loc.locationType,
          loc.locationId
        );
        const available = await getAvailableQty(tx, {
          productId: line.productId,
          locationType: loc.locationType,
          locationId: loc.locationId,
          excludeReservationId: existing?.id,
        });
        if (available.lt(line.quantity)) {
          throw new Error("INSUFFICIENT_AVAILABLE");
        }
      }

      if (existing) {
        await tx.reservationItem.deleteMany({
          where: { reservationId: existing.id },
        });
        const updated = await tx.reservation.update({
          where: { id: existing.id },
          data: {
            expiresAt: null,
            locationType: loc.locationType,
            locationId: loc.locationId,
            items: {
              create: lines.map((l) => ({
                productId: l.productId,
                quantity: new Prisma.Decimal(l.quantity),
              })),
            },
          },
          include: {
            store: { select: { id: true, name: true } },
            createdBy: { select: { id: true, name: true } },
            items: {
              include: {
                product: { select: { id: true, name: true, salePrice: true } },
              },
            },
          },
        });
        return serializeReservation(updated);
      }

      const created = await tx.reservation.create({
        data: {
          companyId: params.companyId,
          storeId: params.storeId,
          locationType: loc.locationType,
          locationId: loc.locationId,
          status: ReservationStatus.ACTIVE,
          expiresAt: null,
          createdById: params.createdById,
          customerNote: CART_AUTOSAVE_NOTE,
          items: {
            create: lines.map((l) => ({
              productId: l.productId,
              quantity: new Prisma.Decimal(l.quantity),
            })),
          },
        },
        include: {
          store: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, salePrice: true } },
            },
          },
        },
      });

      await logActivity({
        tx,
        userId: params.createdById,
        companyId: params.companyId,
        action: "RESERVATION_CREATE",
        entityType: "Reservation",
        entityId: created.id,
        comment: `cart autosave · ${loc.storeName}`,
        metadata: { items: lines, cartAutosave: true },
      });

      return serializeReservation(created);
    },
    { maxWait: 8000, timeout: 20000 }
  );
}
