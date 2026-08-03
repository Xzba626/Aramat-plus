import { Prisma, Role, StoreKind } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/services/activity-log.service";
import { verifyWipeMasterPassword } from "@/lib/services/wipe-master.service";

export const CRM_WIPE_PHRASE = "WIPE";

type Tx = Prisma.TransactionClient;

/**
 * Owner-only CRM wipe.
 * KEEP: Company, Owner account (never deleted), Warehouse, Setting, Unit/ProductType/OperationType/ExpenseType,
 *        OWNER_DIRECT store shell.
 * WIPE: operational + catalog data, BRANCH stores, non-owner users, journals.
 */
export async function wipeCompanyOperationalData(params: {
  companyId: string;
  ownerId: string;
  ownerPassword: string;
  masterPassword?: string;
  confirmPhrase: string;
}) {
  if (params.confirmPhrase.trim() !== CRM_WIPE_PHRASE) {
    throw new Error("WIPE_PHRASE_MISMATCH");
  }

  const owner = await prisma.user.findFirst({
    where: {
      id: params.ownerId,
      companyId: params.companyId,
      role: Role.OWNER,
      isActive: true,
    },
  });
  if (!owner) throw new Error("FORBIDDEN");

  const ok = await bcrypt.compare(params.ownerPassword, owner.passwordHash);
  if (!ok) throw new Error("WRONG_PASSWORD");

  await verifyWipeMasterPassword(params.companyId, params.masterPassword);

  await prisma.$transaction(
    async (tx) => {
      await wipeInTransaction(tx, params.companyId);
    },
    { maxWait: 15_000, timeout: 120_000 }
  );

  await logActivity({
    userId: params.ownerId,
    companyId: params.companyId,
    action: "CRM_WIPE",
    entityType: "Company",
    entityId: params.companyId,
    comment: "Operational CRM data wiped; Owner/settings kept",
  });

  return { ok: true as const };
}

async function wipeInTransaction(tx: Tx, companyId: string) {
  // Break Sale ↔ DiscountRequest ↔ Reservation cycles
  await tx.reservation.updateMany({
    where: { companyId },
    data: { saleId: null },
  });
  await tx.discountRequest.updateMany({
    where: { companyId },
    data: { saleId: null },
  });
  await tx.sale.updateMany({
    where: { store: { companyId } },
    data: { discountRequestId: null, discountApprovedById: null },
  });

  await tx.saleReturn.deleteMany({
    where: { sale: { store: { companyId } } },
  });
  await tx.inventorySession.deleteMany({
    where: { store: { companyId } },
  });
  await tx.reservation.deleteMany({ where: { companyId } });
  await tx.discountRequest.deleteMany({ where: { companyId } });
  await tx.sale.deleteMany({ where: { store: { companyId } } });

  await tx.transfer.deleteMany({
    where: {
      OR: [
        { toStore: { companyId } },
        { fromStore: { companyId } },
        { fromWarehouse: { companyId } },
      ],
    },
  });

  await tx.expense.deleteMany({
    where: {
      OR: [{ store: { companyId } }, { createdBy: { companyId } }],
    },
  });

  await tx.giftRule.deleteMany({ where: { companyId } });
  await tx.priceHistory.deleteMany({
    where: { product: { companyId } },
  });
  await tx.costHistory.deleteMany({
    where: { product: { companyId } },
  });

  await tx.stockBalance.deleteMany({
    where: { product: { companyId } },
  });
  await tx.batch.deleteMany({
    where: { product: { companyId } },
  });

  await tx.product.deleteMany({ where: { companyId } });
  await tx.packagingSku.deleteMany({ where: { companyId } });
  await tx.supplier.deleteMany({ where: { companyId } });
  await tx.brand.deleteMany({ where: { companyId } });
  await tx.category.deleteMany({ where: { companyId } });

  await tx.notification.deleteMany({
    where: { user: { companyId } },
  });
  await tx.activityLog.deleteMany({ where: { companyId } });

  await tx.store.updateMany({
    where: { companyId },
    data: { managerId: null },
  });

  // Clear store bindings on remaining users before deleting non-owners
  await tx.user.updateMany({
    where: { companyId },
    data: { storeId: null },
  });

  await tx.user.deleteMany({
    where: { companyId, role: { not: Role.OWNER } },
  });
  // Owner user is intentionally never deleted — only non-owner staff are removed.

  await tx.store.deleteMany({
    where: { companyId, kind: StoreKind.BRANCH },
  });

  // Ensure OWNER_DIRECT shell exists
  const direct = await tx.store.findFirst({
    where: { companyId, kind: StoreKind.OWNER_DIRECT },
  });
  if (!direct) {
    await tx.store.create({
      data: {
        name: "Личные продажи",
        companyId,
        kind: StoreKind.OWNER_DIRECT,
        isActive: true,
      },
    });
  }

  const warehouse = await tx.warehouse.findFirst({
    where: { companyId, isActive: true },
  });
  if (!warehouse) {
    await tx.warehouse.create({
      data: { name: "Центральный склад", companyId, isActive: true },
    });
  }
}
