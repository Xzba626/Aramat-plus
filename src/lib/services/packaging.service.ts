import {
  AccountingType,
  ExpensePeriodicity,
  LocationType,
  NotificationType,
  ProductKind,
  Prisma,
  StoreKind,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";
import { logActivity } from "@/lib/services/activity-log.service";
import { resolveUnitId } from "@/lib/services/product-nomenclature.service";
import { deductBatchesFifo } from "@/lib/services/stock.service";
import { notifyCompanyRoles } from "@/lib/services/notification.service";
import { isProofArtifactName } from "@/lib/proof-artifacts";
import {
  AUTO_BOTTLE_PREFIX,
  BOTTLE_EXPENSE_TYPE_NAME,
} from "@/lib/packaging-expense";

export const BOTTLE_LOW_STOCK_THRESHOLD = 5; // legacy default; runtime uses getLowStockThresholds().bottlePiece
const DEFAULT_VOLUMES = [5, 10, 30, 50, 100] as const;

export class PackagingDuplicateError extends Error {
  existingId: string;
  constructor(existingId: string) {
    super("PACKAGING_DUPLICATE");
    this.name = "PackagingDuplicateError";
    this.existingId = existingId;
  }
}

function costsEqual(
  a: number | null | undefined,
  b: Prisma.Decimal | number | null | undefined
) {
  const left = a == null ? null : Math.round(Number(a) * 10000) / 10000;
  const right =
    b == null || b === undefined
      ? null
      : Math.round(Number(b.toString()) * 10000) / 10000;
  return left === right;
}

/**
 * Exact business duplicate only — volume alone is never unique.
 * Same volume + different name/color/cost → allowed.
 */
async function findExactPackagingDuplicate(params: {
  companyId: string;
  name: string;
  volumeMl: number;
  material: string;
  color: string;
  defaultCost?: number | null;
  excludeId?: string;
}) {
  const candidates = await prisma.packagingSku.findMany({
    where: {
      companyId: params.companyId,
      name: params.name,
      material: params.material,
      color: params.color,
      ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
    },
    select: {
      id: true,
      volumeMl: true,
      defaultCost: true,
      isActive: true,
    },
  });
  return (
    candidates.find(
      (c) =>
        Math.abs(decimalToNumber(c.volumeMl) - params.volumeMl) < 0.0005 &&
        costsEqual(params.defaultCost, c.defaultCost)
    ) ?? null
  );
}

function normalizeMaterial(v?: string | null) {
  const m = (v?.trim() || "glass").toLowerCase();
  return m === "plastic" ? "plastic" : "glass";
}
function normalizeColor(v?: string | null) {
  return v?.trim() || "";
}

function defaultName(volumeMl: number, material: string) {
  const mat =
    material === "glass" ? "стекло" : material === "plastic" ? "пластик" : material;
  return `Флакон ${volumeMl} мл · ${mat}`;
}

export type PackagingSkuInput = {
  name?: string;
  volumeMl: number;
  material?: string | null;
  color?: string | null;
  skuCode?: string | null;
  defaultCost?: number | null;
  isDefaultForVolume?: boolean;
  isActive?: boolean;
};

/** Ensure stock Product (PIECE, PACKAGING) exists for a PackagingSku. */
export async function ensurePackagingProduct(packagingSkuId: string) {
  const sku = await prisma.packagingSku.findUniqueOrThrow({
    where: { id: packagingSkuId },
  });
  const existing = await prisma.product.findFirst({
    where: {
      companyId: sku.companyId,
      kind: ProductKind.PACKAGING,
      packagingSkuId: sku.id,
      isActive: true,
    },
  });
  if (existing) return existing;

  const unitId = await resolveUnitId(
    prisma,
    sku.companyId,
    AccountingType.PIECE,
    null
  );
  const planCost = sku.defaultCost != null ? decimalToNumber(sku.defaultCost) : 1;
  return prisma.product.create({
    data: {
      name: sku.name,
      companyId: sku.companyId,
      kind: ProductKind.PACKAGING,
      packagingSkuId: sku.id,
      accountingType: AccountingType.PIECE,
      unitId,
      // Never sold to customer — salePrice must stay 0 (schema requires a value).
      salePrice: 0,
      defaultCostPerUnit: planCost > 0 ? planCost : null,
      isActive: sku.isActive,
    },
  });
}

export async function listPackagingSkus(
  companyId: string,
  opts?: { includeInactive?: boolean }
) {
  const [warehouse, branches] = await Promise.all([
    prisma.warehouse.findFirst({
      where: { companyId, isActive: true },
    }),
    prisma.store.findMany({
      where: { companyId, kind: "BRANCH", isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const skus = await prisma.packagingSku.findMany({
    where: {
      companyId,
      ...(opts?.includeInactive ? {} : { isActive: true }),
    },
    include: {
      products: {
        where: { kind: ProductKind.PACKAGING, isActive: true },
        include: {
          stockBalances: {
            where: {
              OR: [
                ...(warehouse
                  ? [
                      {
                        locationType: LocationType.WAREHOUSE,
                        locationId: warehouse.id,
                      },
                    ]
                  : []),
                {
                  locationType: LocationType.STORE,
                  locationId: { in: branches.map((b) => b.id) },
                },
              ],
            },
          },
        },
        take: 1,
      },
    },
    orderBy: [{ volumeMl: "asc" }, { name: "asc" }],
  });

  const storeName = new Map(branches.map((b) => [b.id, b.name]));

  return skus.map((s) => {
    const product = s.products[0] ?? null;
    const balances = product?.stockBalances ?? [];
    const warehouseQty = balances
      .filter(
        (b) =>
          b.locationType === LocationType.WAREHOUSE &&
          warehouse &&
          b.locationId === warehouse.id
      )
      .reduce((a, b) => a + decimalToNumber(b.quantity), 0);

    const byStore = new Map<string, number>();
    for (const b of balances) {
      if (b.locationType !== LocationType.STORE) continue;
      const q = decimalToNumber(b.quantity);
      if (q <= 0) continue;
      byStore.set(b.locationId, (byStore.get(b.locationId) ?? 0) + q);
    }
    const storeQtys = branches.map((br) => ({
      storeId: br.id,
      storeName: storeName.get(br.id) ?? br.name,
      qty: Math.round((byStore.get(br.id) ?? 0) * 1000) / 1000,
    }));

    return {
      id: s.id,
      name: s.name,
      volumeMl: decimalToNumber(s.volumeMl),
      material: s.material,
      color: s.color,
      skuCode: s.skuCode,
      defaultCost:
        s.defaultCost != null ? decimalToNumber(s.defaultCost) : null,
      isDefaultForVolume: s.isDefaultForVolume,
      isActive: s.isActive,
      productId: product?.id ?? null,
      warehouseQty: Math.round(warehouseQty * 1000) / 1000,
      storeQtys,
      createdAt: s.createdAt.toISOString(),
    };
  });
}

export async function createPackagingSku(params: {
  companyId: string;
  actorId: string;
  data: PackagingSkuInput;
}) {
  const material = normalizeMaterial(params.data.material);
  const color = normalizeColor(params.data.color);
  const volumeMl = params.data.volumeMl;
  if (!(volumeMl > 0)) {
    throw new Error("INVALID_VOLUME");
  }
  const name =
    params.data.name?.trim() || defaultName(volumeMl, material);

  const dup = await findExactPackagingDuplicate({
    companyId: params.companyId,
    name,
    volumeMl,
    material,
    color,
    defaultCost: params.data.defaultCost ?? null,
  });
  if (dup) throw new PackagingDuplicateError(dup.id);

  const sku = await prisma.packagingSku.create({
    data: {
      companyId: params.companyId,
      name,
      volumeMl,
      material,
      color,
      cap: "",
      skuCode: params.data.skuCode ?? null,
      defaultCost: params.data.defaultCost ?? null,
      isDefaultForVolume: params.data.isDefaultForVolume ?? false,
      isActive: params.data.isActive ?? true,
    },
  });

  const product = await ensurePackagingProduct(sku.id);

  await logActivity({
    userId: params.actorId || null,
    companyId: params.companyId,
    action: "PACKAGING_SKU_CREATE",
    entityType: "PackagingSku",
    entityId: sku.id,
    comment: `${name} · ${volumeMl} ml`,
  });

  return { sku, product };
}

export async function updatePackagingSku(params: {
  companyId: string;
  actorId: string;
  id: string;
  data: Partial<PackagingSkuInput> & { isActive?: boolean };
}) {
  const existing = await prisma.packagingSku.findFirst({
    where: { id: params.id, companyId: params.companyId },
  });
  if (!existing) throw new Error("NOT_FOUND");

  const data: Prisma.PackagingSkuUpdateInput = {};
  if (params.data.name != null) data.name = params.data.name.trim();
  if (params.data.volumeMl != null) data.volumeMl = params.data.volumeMl;
  if (params.data.material != null)
    data.material = normalizeMaterial(params.data.material);
  if (params.data.color != null) data.color = normalizeColor(params.data.color);
  if (params.data.skuCode !== undefined) data.skuCode = params.data.skuCode;
  if (params.data.defaultCost !== undefined)
    data.defaultCost = params.data.defaultCost;
  if (params.data.isDefaultForVolume != null)
    data.isDefaultForVolume = params.data.isDefaultForVolume;
  if (params.data.isActive != null) data.isActive = params.data.isActive;

  const nextName =
    params.data.name != null
      ? params.data.name.trim()
      : existing.name;
  const nextVolume =
    params.data.volumeMl != null
      ? params.data.volumeMl
      : decimalToNumber(existing.volumeMl);
  const nextMaterial =
    params.data.material != null
      ? normalizeMaterial(params.data.material)
      : existing.material;
  const nextColor =
    params.data.color != null
      ? normalizeColor(params.data.color)
      : existing.color;
  const nextCost =
    params.data.defaultCost !== undefined
      ? params.data.defaultCost
      : existing.defaultCost == null
        ? null
        : decimalToNumber(existing.defaultCost);

  const dup = await findExactPackagingDuplicate({
    companyId: params.companyId,
    name: nextName,
    volumeMl: nextVolume,
    material: nextMaterial,
    color: nextColor,
    defaultCost: nextCost,
    excludeId: existing.id,
  });
  if (dup) throw new PackagingDuplicateError(dup.id);

  const sku = await prisma.packagingSku.update({
    where: { id: params.id },
    data,
  });

  // Keep stock product name / active in sync
  await prisma.product.updateMany({
    where: {
      packagingSkuId: sku.id,
      kind: ProductKind.PACKAGING,
      companyId: params.companyId,
    },
    data: {
      name: sku.name,
      isActive: sku.isActive,
      salePrice: 0,
      ...(sku.defaultCost != null
        ? { defaultCostPerUnit: sku.defaultCost }
        : {}),
    },
  });

  if (sku.isActive) {
    await ensurePackagingProduct(sku.id);
  }

  await logActivity({
    userId: params.actorId,
    companyId: params.companyId,
    action: "PACKAGING_SKU_UPDATE",
    entityType: "PackagingSku",
    entityId: sku.id,
    comment: sku.name,
  });

  return sku;
}

export async function ensureDefaultPackagingSkus(companyId: string, actorId?: string) {
  const created: string[] = [];
  for (const volumeMl of DEFAULT_VOLUMES) {
    const exists = await prisma.packagingSku.findFirst({
      where: {
        companyId,
        volumeMl,
        material: "glass",
        color: "",
        cap: "",
      },
    });
    if (exists) {
      await ensurePackagingProduct(exists.id);
      continue;
    }
    const material = "glass";
    const name = defaultName(volumeMl, material);
    const defaultCost = volumeMl <= 10 ? 1 : volumeMl <= 30 ? 2 : 3;
    const sku = await prisma.packagingSku.create({
      data: {
        companyId,
        name,
        volumeMl,
        material,
        color: "",
        cap: "",
        defaultCost,
        isDefaultForVolume: true,
        isActive: true,
      },
    });
    await ensurePackagingProduct(sku.id);
    if (actorId) {
      await logActivity({
        userId: actorId,
        companyId,
        action: "PACKAGING_SKU_CREATE",
        entityType: "PackagingSku",
        entityId: sku.id,
        comment: `${name} · seed`,
      });
    }
    created.push(sku.id);
  }
  return created;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Find or create expense type for bottle opex on WEIGHT sales. */
export async function ensureBottleExpenseType(companyId: string) {
  const existing = await prisma.expenseType.findFirst({
    where: { companyId, name: BOTTLE_EXPENSE_TYPE_NAME },
  });
  if (existing) return existing;
  return prisma.expenseType.create({
    data: { companyId, name: BOTTLE_EXPENSE_TYPE_NAME },
  });
}

export async function resolvePackagingProduct(params: {
  companyId: string;
  packagingSkuId?: string | null;
  packagingProductId?: string | null;
}) {
  if (params.packagingProductId) {
    const product = await prisma.product.findFirst({
      where: {
        id: params.packagingProductId,
        companyId: params.companyId,
        kind: ProductKind.PACKAGING,
        isActive: true,
      },
      include: { packagingSku: true },
    });
    if (!product) throw new Error("BOTTLE_NOT_FOUND");
    return product;
  }
  if (params.packagingSkuId) {
    await ensurePackagingProduct(params.packagingSkuId);
    const product = await prisma.product.findFirst({
      where: {
        companyId: params.companyId,
        kind: ProductKind.PACKAGING,
        packagingSkuId: params.packagingSkuId,
        isActive: true,
      },
      include: { packagingSku: true },
    });
    if (!product) throw new Error("BOTTLE_NOT_FOUND");
    return product;
  }
  throw new Error("BOTTLE_REQUIRED");
}

/** Packaging bottles available for POS at a store (or warehouse for owner-direct). */
export async function listStorePackagingStock(
  companyId: string,
  storeId: string
) {
  const store = await prisma.store.findFirst({
    where: { id: storeId, companyId, isActive: true },
  });
  if (!store) throw new Error("STORE_NOT_FOUND");

  let locationType: LocationType = LocationType.STORE;
  let locationId = storeId;
  if (store.kind === StoreKind.OWNER_DIRECT) {
    const warehouse = await prisma.warehouse.findFirst({
      where: { companyId, isActive: true },
      select: { id: true },
    });
    if (!warehouse) throw new Error("WAREHOUSE_MISSING");
    locationType = LocationType.WAREHOUSE;
    locationId = warehouse.id;
  }

  const balances = await prisma.stockBalance.findMany({
    where: {
      locationType,
      locationId,
      quantity: { gt: 0 },
      product: {
        companyId,
        kind: ProductKind.PACKAGING,
        isActive: true,
      },
    },
    include: {
      product: {
        include: { packagingSku: true, unit: true },
      },
    },
    orderBy: { product: { name: "asc" } },
  });

  return balances.map((b) => ({
    packagingSkuId: b.product.packagingSkuId,
    packagingProductId: b.productId,
    name: b.product.name,
    volumeMl: b.product.packagingSku
      ? decimalToNumber(b.product.packagingSku.volumeMl)
      : null,
    quantity: Math.round(decimalToNumber(b.quantity) * 1000) / 1000,
    defaultCost:
      b.product.packagingSku?.defaultCost != null
        ? decimalToNumber(b.product.packagingSku.defaultCost)
        : b.product.defaultCostPerUnit != null
          ? decimalToNumber(b.product.defaultCostPerUnit)
          : null,
  }));
}

export async function getPackagingQtyAtStore(
  productId: string,
  storeId: string
): Promise<number> {
  const row = await prisma.stockBalance.findUnique({
    where: {
      productId_locationType_locationId: {
        productId,
        locationType: LocationType.STORE,
        locationId: storeId,
      },
    },
  });
  return row ? decimalToNumber(row.quantity) : 0;
}

export type BottleDeductResult = {
  packagingProductId: string;
  packagingQuantity: Prisma.Decimal;
  packagingCostPerUnit: Prisma.Decimal;
  bottleExpenseAmount: number;
};

/** Deduct bottle from sale location (store shelf or warehouse for owner-direct). */
export async function deductBottleFromStore(
  tx: Prisma.TransactionClient,
  params: {
    packagingProductId: string;
    storeId: string;
    quantity?: number;
    locationType?: LocationType;
    locationId?: string;
  }
): Promise<BottleDeductResult> {
  const qty = new Prisma.Decimal(params.quantity ?? 1);
  const locationType = params.locationType ?? LocationType.STORE;
  const locationId = params.locationId ?? params.storeId;
  const consumed = await deductBatchesFifo(tx, {
    productId: params.packagingProductId,
    locationType,
    locationId,
    quantity: qty,
  });
  const totalCost = consumed.reduce(
    (s, c) => s + decimalToNumber(c.costPerUnit) * decimalToNumber(c.quantity),
    0
  );
  const totalQty = consumed.reduce(
    (s, c) => s + decimalToNumber(c.quantity),
    0
  );
  const avgCost = totalQty > 0 ? totalCost / totalQty : 0;
  return {
    packagingProductId: params.packagingProductId,
    packagingQuantity: qty,
    packagingCostPerUnit: new Prisma.Decimal(avgCost),
    bottleExpenseAmount: Math.round(totalCost * 100) / 100,
  };
}

export async function createBottleSaleExpenseInTx(
  tx: Prisma.TransactionClient,
  params: {
    expenseTypeId: string;
    createdById: string;
    storeId: string;
    amount: number;
    /** Kept for call-site compatibility / audit linkage; not written into description. */
    saleId: string;
    label: string;
  }
) {
  if (!(params.amount > 0)) return null;
  void params.saleId;
  const now = new Date();
  return tx.expense.create({
    data: {
      expenseTypeId: params.expenseTypeId,
      amount: new Prisma.Decimal(params.amount),
      storeId: params.storeId,
      // Human marker for export — never embed raw sale:cuid in description.
      description: params.label?.trim()
        ? `${AUTO_BOTTLE_PREFIX}|${params.label.trim()}`
        : AUTO_BOTTLE_PREFIX,
      createdById: params.createdById,
      incurredAt: now,
      periodicity: ExpensePeriodicity.ONCE,
      startsAt: startOfDay(now),
    },
  });
}

export async function maybeNotifyLowBottleStock(params: {
  companyId: string;
  storeId: string;
  storeName: string;
  packagingProductId: string;
  skuName: string;
  qtyAfter: number;
}) {
  const store = await prisma.store.findFirst({
    where: { id: params.storeId, companyId: params.companyId },
    select: { notifyLowStock: true },
  });
  if (store && !store.notifyLowStock) return;

  const { getLowStockThresholds } = await import(
    "@/lib/services/low-stock-thresholds.service"
  );
  const thresholds = await getLowStockThresholds(params.companyId);
  if (params.qtyAfter > thresholds.bottlePiece) return;
  if (isProofArtifactName(params.skuName)) return;
  await notifyCompanyRoles({
    companyId: params.companyId,
    type: NotificationType.LOW_STOCK,
    title: "notif.lowBottles",
    message: `${params.storeName}: «${params.skuName}» — ${params.qtyAfter}`,
    entityType: "Product",
    entityId: params.packagingProductId,
  });
}

/** After transfer to store: notify owner if any packaging SKU is low. */
export async function checkLowBottleStockAfterTransfer(params: {
  companyId: string;
  storeId: string;
  storeName: string;
  productIds: string[];
}) {
  for (const productId of params.productIds) {
    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        companyId: params.companyId,
        kind: ProductKind.PACKAGING,
      },
      select: { id: true, name: true },
    });
    if (!product) continue;
    const qty = await getPackagingQtyAtStore(productId, params.storeId);
    await maybeNotifyLowBottleStock({
      companyId: params.companyId,
      storeId: params.storeId,
      storeName: params.storeName,
      packagingProductId: product.id,
      skuName: product.name,
      qtyAfter: qty,
    });
  }
}
