/**
 * Application flows — same service paths as HTTP API routes.
 * NOT prisma.sale.create() shortcuts.
 */
import {
  PrismaClient,
  Role,
  StoreKind,
  AccountingType,
  LocationType,
  Prisma,
  ReturnReasonCode,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import { addBatch } from "../../../src/lib/services/stock.service";
import { createSale } from "../../../src/lib/services/sale.service";
import { createTransfer } from "../../../src/lib/services/transfer.service";
import { ensureOwnerDirectStore } from "../../../src/lib/services/owner-direct.service";
import {
  createSaleReturn,
  decideSaleReturn,
} from "../../../src/lib/services/sale-return.service";
import {
  productCreateFingerprint,
  findRecentProductCreateByFingerprint,
} from "../../../src/lib/services/product-create.service";
import {
  nextProductSku,
  resolveProductAccountingType,
  resolveUnitId,
} from "../../../src/lib/services/product-nomenclature.service";
import { logActivity } from "../../../src/lib/services/activity-log.service";
import { BATCH_NOTE_MARKERS } from "../../../src/lib/i18n/labels";
import { createExpense } from "../../../src/lib/services/expense.service";

const prisma = new PrismaClient();

export type LabContext = {
  companyId: string;
  ownerId: string;
  warehouseId: string;
  branchStoreId: string;
  ownerDirectStoreId: string;
  sellerId: string;
};

export async function loadLabContext(): Promise<LabContext> {
  const company = await prisma.company.findFirstOrThrow();
  const owner = await prisma.user.findFirstOrThrow({
    where: { companyId: company.id, role: Role.OWNER },
  });
  const warehouse = await prisma.warehouse.findFirstOrThrow({
    where: { companyId: company.id, isActive: true },
  });
  const branch = await prisma.store.findFirstOrThrow({
    where: { companyId: company.id, kind: StoreKind.BRANCH, isActive: true },
  });
  const ownerDirect = await ensureOwnerDirectStore(company.id);
  let seller = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.SELLER, storeId: branch.id },
  });
  if (!seller) {
    seller = await prisma.user.findFirstOrThrow({
      where: { companyId: company.id, role: Role.SELLER },
    });
    await prisma.user.update({
      where: { id: seller.id },
      data: { storeId: branch.id },
    });
  }
  return {
    companyId: company.id,
    ownerId: owner.id,
    warehouseId: warehouse.id,
    branchStoreId: branch.id,
    ownerDirectStoreId: ownerDirect.id,
    sellerId: seller.id,
  };
}

/** Mirrors POST /api/stores */
export async function createStoreFlow(
  ctx: LabContext,
  name: string
): Promise<{ id: string }> {
  const store = await prisma.store.create({
    data: {
      companyId: ctx.companyId,
      name,
      kind: StoreKind.BRANCH,
      isActive: true,
    },
  });
  return { id: store.id };
}

/** Mirrors POST /api/users (seller) */
export async function createSellerFlow(
  ctx: LabContext,
  params: { email: string; name: string; password: string; storeId: string }
) {
  const passwordHash = await bcrypt.hash(params.password, 10);
  const user = await prisma.user.create({
    data: {
      email: params.email,
      name: params.name,
      role: Role.SELLER,
      passwordHash,
      companyId: ctx.companyId,
      storeId: params.storeId,
      isActive: true,
    },
  });
  await logActivity({
    userId: ctx.ownerId,
    companyId: ctx.companyId,
    action: "USER_CREATE",
    entityType: "User",
    entityId: user.id,
    comment: user.email,
  });
  return user;
}

/** Mirrors POST /api/products */
export async function createProductFlow(
  ctx: LabContext,
  params: {
    name: string;
    sku?: string;
    accountingType: AccountingType;
    salePrice: number;
    defaultCostPerUnit: number;
    initialQuantity?: number;
    idempotencyKey?: string;
  }
) {
  const warehouse = await prisma.warehouse.findFirstOrThrow({
    where: { id: ctx.warehouseId },
  });

  const sku =
    params.sku?.trim() ||
    (await nextProductSku(prisma, ctx.companyId, "GEN"));

  const accountingType = await resolveProductAccountingType(
    prisma,
    ctx.companyId,
    null,
    params.accountingType
  );
  const unitId = await resolveUnitId(
    prisma,
    ctx.companyId,
    accountingType,
    null
  );

  const createFingerprint = productCreateFingerprint({
    userId: ctx.ownerId,
    name: params.name,
    brandId: null,
    categoryId: null,
    accountingType,
    salePrice: params.salePrice,
    sku,
    idempotencyKey: params.idempotencyKey ?? null,
  });

  const deduped = await findRecentProductCreateByFingerprint({
    companyId: ctx.companyId,
    userId: ctx.ownerId,
    fingerprint: createFingerprint,
  });
  if (deduped) {
    return { product: deduped, deduplicated: true as const };
  }

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        name: params.name,
        sku,
        companyId: ctx.companyId,
        accountingType,
        unitId,
        salePrice: new Prisma.Decimal(params.salePrice),
        defaultCostPerUnit: new Prisma.Decimal(params.defaultCostPerUnit),
        minStock: 0,
      },
    });

    if (params.initialQuantity && params.initialQuantity > 0) {
      await addBatch(tx, {
        productId: created.id,
        locationType: LocationType.WAREHOUSE,
        locationId: warehouse.id,
        quantity: params.initialQuantity,
        costPerUnit: params.defaultCostPerUnit,
        salePrice: params.salePrice,
        notes: BATCH_NOTE_MARKERS.INITIAL_STOCK,
        createdById: ctx.ownerId,
      });
    }

    await logActivity({
      tx,
      userId: ctx.ownerId,
      companyId: ctx.companyId,
      action: "PRODUCT_CREATE",
      entityType: "Product",
      entityId: created.id,
      comment: created.name,
      metadata: { createFingerprint, sku },
    });

    return created;
  });

  return { product, deduplicated: false as const };
}

/** Mirrors POST /api/products/[id]/batches */
export async function receiveBatchFlow(
  ctx: LabContext,
  params: {
    productId: string;
    quantity: number;
    costPerUnit: number;
    salePrice: number;
    notes?: string;
  }
) {
  return prisma.$transaction(async (tx) =>
    addBatch(tx, {
      productId: params.productId,
      locationType: LocationType.WAREHOUSE,
      locationId: ctx.warehouseId,
      quantity: params.quantity,
      costPerUnit: params.costPerUnit,
      salePrice: params.salePrice,
      notes: params.notes ?? "forensic-receive",
      createdById: ctx.ownerId,
    })
  );
}

/** Mirrors POST /api/transfers */
export async function transferToStoreFlow(
  ctx: LabContext,
  params: { storeId: string; productId: string; quantity: number }
) {
  return createTransfer({
    companyId: ctx.companyId,
    fromWarehouseId: ctx.warehouseId,
    toStoreId: params.storeId,
    createdById: ctx.ownerId,
    items: [{ productId: params.productId, quantity: params.quantity }],
    notes: "forensic-transfer",
  });
}

/** Mirrors POST /api/sales */
export async function saleFlow(
  ctx: LabContext,
  params: {
    storeId: string;
    sellerId: string;
    productId: string;
    quantity: number;
    accountingType: AccountingType;
    discountAmount?: number;
    confirmBelowCost?: boolean;
  }
) {
  return createSale({
    companyId: ctx.companyId,
    storeId: params.storeId,
    sellerId: params.sellerId,
    items: [
      {
        productId: params.productId,
        quantity: params.quantity,
        ...(params.accountingType === AccountingType.WEIGHT
          ? { containerSource: "CUSTOMER_BOTTLE" as const }
          : {}),
      },
    ],
    discountAmount: params.discountAmount,
    confirmBelowCost: params.confirmBelowCost,
    paymentMethod: "CASH",
  });
}

/** Mirrors POST /api/returns + decision */
export async function returnAndApproveFlow(
  ctx: LabContext,
  params: {
    saleId: string;
    saleItemId: string;
    quantity: number;
  }
) {
  const ret = await createSaleReturn({
    companyId: ctx.companyId,
    saleId: params.saleId,
    requesterId: ctx.ownerId,
    reasonCode: ReturnReasonCode.OTHER,
    items: [{ saleItemId: params.saleItemId, quantity: params.quantity }],
  });
  await decideSaleReturn({
    companyId: ctx.companyId,
    returnId: ret.id,
    reviewerId: ctx.ownerId,
    decision: "APPROVE",
  });
  return ret;
}

/** Mirrors POST /api/returns + REJECT decision */
export async function returnAndRejectFlow(
  ctx: LabContext,
  params: {
    saleId: string;
    saleItemId: string;
    quantity: number;
  }
) {
  const ret = await createSaleReturn({
    companyId: ctx.companyId,
    saleId: params.saleId,
    requesterId: ctx.ownerId,
    reasonCode: ReturnReasonCode.OTHER,
    items: [{ saleItemId: params.saleItemId, quantity: params.quantity }],
  });
  await decideSaleReturn({
    companyId: ctx.companyId,
    returnId: ret.id,
    reviewerId: ctx.ownerId,
    decision: "REJECT",
  });
  return ret;
}

/** Mirrors POST /api/expenses */
export async function expenseFlow(
  ctx: LabContext,
  params: {
    storeId: string;
    expenseTypeId: string;
    amount: number;
    description?: string;
  }
) {
  return createExpense({
    companyId: ctx.companyId,
    createdById: ctx.ownerId,
    expenseTypeId: params.expenseTypeId,
    amount: params.amount,
    storeId: params.storeId,
    description: params.description ?? "forensic-expense",
  });
}

export async function countSales(companyId: string) {
  return prisma.sale.count({
    where: { store: { companyId } },
  });
}

export async function disconnectFlows() {
  await prisma.$disconnect();
}
