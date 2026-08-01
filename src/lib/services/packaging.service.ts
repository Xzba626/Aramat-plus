import {
  AccountingType,
  LocationType,
  ProductKind,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";
import { logActivity } from "@/lib/services/activity-log.service";
import { resolveUnitId } from "@/lib/services/product-nomenclature.service";

const DEFAULT_VOLUMES = [5, 10, 30, 50, 100] as const;

export type PackagingSkuInput = {
  name?: string;
  volumeMl: number;
  material?: string | null;
  color?: string | null;
  cap?: string | null;
  skuCode?: string | null;
  defaultCost?: number | null;
  isDefaultForVolume?: boolean;
  isActive?: boolean;
};

function normalizeMaterial(v?: string | null) {
  return (v?.trim() || "glass").toLowerCase();
}
function normalizeColor(v?: string | null) {
  return v?.trim() || "";
}
function normalizeCap(v?: string | null) {
  return v?.trim() || "";
}

function defaultName(volumeMl: number, material: string) {
  const mat =
    material === "glass" ? "стекло" : material === "plastic" ? "пластик" : material;
  return `Флакон ${volumeMl} мл · ${mat}`;
}

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
      salePrice: planCost > 0 ? planCost : 0.01, // not sold as revenue; placeholder
      defaultCostPerUnit: planCost > 0 ? planCost : null,
      isActive: sku.isActive,
    },
  });
}

export async function listPackagingSkus(
  companyId: string,
  opts?: { includeInactive?: boolean }
) {
  const warehouse = await prisma.warehouse.findFirst({
    where: { companyId, isActive: true },
  });
  const skus = await prisma.packagingSku.findMany({
    where: {
      companyId,
      ...(opts?.includeInactive ? {} : { isActive: true }),
    },
    include: {
      products: {
        where: { kind: ProductKind.PACKAGING, isActive: true },
        include: {
          stockBalances: warehouse
            ? {
                where: {
                  locationType: LocationType.WAREHOUSE,
                  locationId: warehouse.id,
                },
              }
            : true,
        },
        take: 1,
      },
    },
    orderBy: [{ volumeMl: "asc" }, { name: "asc" }],
  });

  return skus.map((s) => {
    const product = s.products[0] ?? null;
    const qty = product
      ? product.stockBalances.reduce((a, b) => a + decimalToNumber(b.quantity), 0)
      : 0;
    return {
      id: s.id,
      name: s.name,
      volumeMl: decimalToNumber(s.volumeMl),
      material: s.material,
      color: s.color,
      cap: s.cap,
      skuCode: s.skuCode,
      defaultCost:
        s.defaultCost != null ? decimalToNumber(s.defaultCost) : null,
      isDefaultForVolume: s.isDefaultForVolume,
      isActive: s.isActive,
      productId: product?.id ?? null,
      warehouseQty: Math.round(qty * 1000) / 1000,
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
  const cap = normalizeCap(params.data.cap);
  const volumeMl = params.data.volumeMl;
  if (!(volumeMl > 0)) {
    throw new Error("INVALID_VOLUME");
  }
  const name =
    params.data.name?.trim() || defaultName(volumeMl, material);

  const sku = await prisma.packagingSku.create({
    data: {
      companyId: params.companyId,
      name,
      volumeMl,
      material,
      color,
      cap,
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
  if (params.data.cap != null) data.cap = normalizeCap(params.data.cap);
  if (params.data.skuCode !== undefined) data.skuCode = params.data.skuCode;
  if (params.data.defaultCost !== undefined)
    data.defaultCost = params.data.defaultCost;
  if (params.data.isDefaultForVolume != null)
    data.isDefaultForVolume = params.data.isDefaultForVolume;
  if (params.data.isActive != null) data.isActive = params.data.isActive;

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
      ...(sku.defaultCost != null
        ? { defaultCostPerUnit: sku.defaultCost, salePrice: sku.defaultCost }
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
