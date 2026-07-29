import { prisma } from "@/lib/prisma";
import { StoreKind, Prisma } from "@prisma/client";

const OWNER_DIRECT_NAME = "Личные продажи владельца";

/**
 * Гарантирует ровно один канал Owner Direct Sales на компанию.
 * Создаётся автоматически; не является обычным филиалом.
 */
export async function ensureOwnerDirectStore(
  companyId: string,
  tx?: Prisma.TransactionClient
) {
  const db = tx ?? prisma;
  const existing = await db.store.findFirst({
    where: { companyId, kind: StoreKind.OWNER_DIRECT },
  });
  if (existing) return existing;

  return db.store.create({
    data: {
      companyId,
      name: OWNER_DIRECT_NAME,
      kind: StoreKind.OWNER_DIRECT,
      address: "Центральный склад · прямые продажи",
      isActive: true,
    },
  });
}

export function isOwnerDirect(
  store: { kind?: StoreKind | string } | null | undefined
) {
  return store?.kind === StoreKind.OWNER_DIRECT || store?.kind === "OWNER_DIRECT";
}

export { OWNER_DIRECT_NAME };
