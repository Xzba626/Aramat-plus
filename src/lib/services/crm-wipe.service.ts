import { Prisma, Role, StoreKind } from "@prisma/client";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/services/activity-log.service";
import { verifyWipeMasterPassword } from "@/lib/services/wipe-master.service";
import { SEED_OWNER_EMAIL, SEED_OWNER_NAME } from "@/lib/seed-defaults";
import { ensureOwnerDirectStore } from "@/lib/services/owner-direct.service";

export const CRM_WIPE_PHRASE = "WIPE";

type Tx = Prisma.TransactionClient;

/**
 * Owner-only CRM wipe.
 * KEEP: Company, Owner account (email/name reset; password = one-time random),
 *        Warehouse shell, Setting, Unit/ProductType/OperationType/ExpenseType.
 * WIPE: all operational + catalog data, ALL stores (incl. OWNER_DIRECT),
 *        non-owner users, journals (then one wipe confirmation row).
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

  // One-time random password — never reset to known seed defaults in source.
  const temporaryPassword = randomBytes(18).toString("base64url");
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);
  const wipedAt = new Date();

  await prisma.$transaction(
    async (tx) => {
      await wipeInTransaction(tx, params.companyId);
      await tx.user.update({
        where: { id: owner.id },
        data: {
          email: SEED_OWNER_EMAIL,
          name: SEED_OWNER_NAME,
          passwordHash,
          failedLoginCount: 0,
          lockedUntil: null,
          storeId: null,
        },
      });
    },
    { maxWait: 15_000, timeout: 120_000 }
  );

  // Single confirmation row — only journal entry after wipe
  const when = wipedAt.toLocaleString("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  });
  await logActivity({
    userId: params.ownerId,
    companyId: params.companyId,
    action: "CRM_WIPE",
    entityType: "Company",
    entityId: params.companyId,
    comment: `CRM очищена владельцем. ${when}`,
  });

  // Recreate empty Owner Direct channel after wipe (ops empty-state)
  await ensureOwnerDirectStore(params.companyId);

  return {
    ok: true as const,
    ownerEmail: SEED_OWNER_EMAIL,
    ownerPasswordReset: true as const,
    /** Shown once in wipe UI — not logged. */
    temporaryPassword,
  };
}

async function wipeInTransaction(tx: Tx, companyId: string) {
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

  await tx.user.updateMany({
    where: { companyId },
    data: { storeId: null },
  });

  await tx.user.deleteMany({
    where: { companyId, role: { not: Role.OWNER } },
  });

  // All stores including OWNER_DIRECT / demo branches
  await tx.store.deleteMany({ where: { companyId } });

  const warehouse = await tx.warehouse.findFirst({
    where: { companyId, isActive: true },
  });
  if (!warehouse) {
    await tx.warehouse.create({
      data: { name: "Центральный склад", companyId, isActive: true },
    });
  }
}
