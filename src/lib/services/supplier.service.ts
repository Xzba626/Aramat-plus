import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/services/activity-log.service";

export async function listSuppliers(
  companyId: string,
  opts?: { includeInactive?: boolean }
) {
  return prisma.supplier.findMany({
    where: {
      companyId,
      ...(opts?.includeInactive ? {} : { isActive: true }),
    },
    orderBy: { name: "asc" },
  });
}

export async function createSupplier(params: {
  companyId: string;
  actorId: string;
  name: string;
  phone?: string | null;
  notes?: string | null;
}) {
  const name = params.name.trim();
  if (!name) throw new Error("VALIDATION_ERROR");

  const item = await prisma.supplier.create({
    data: {
      name,
      phone: params.phone?.trim() || null,
      notes: params.notes?.trim() || null,
      companyId: params.companyId,
      isActive: true,
    },
  });

  await logActivity({
    userId: params.actorId,
    companyId: params.companyId,
    action: "SUPPLIER_CREATE",
    entityType: "Supplier",
    entityId: item.id,
    comment: item.name,
  });

  return item;
}

export async function updateSupplier(params: {
  companyId: string;
  actorId: string;
  id: string;
  name?: string;
  phone?: string | null;
  notes?: string | null;
  isActive?: boolean;
}) {
  const existing = await prisma.supplier.findFirst({
    where: { id: params.id, companyId: params.companyId },
  });
  if (!existing) throw new Error("SUPPLIER_NOT_FOUND");

  const item = await prisma.supplier.update({
    where: { id: existing.id },
    data: {
      name: params.name?.trim() || undefined,
      phone: params.phone === undefined ? undefined : params.phone?.trim() || null,
      notes: params.notes === undefined ? undefined : params.notes?.trim() || null,
      isActive: params.isActive,
    },
  });

  await logActivity({
    userId: params.actorId,
    companyId: params.companyId,
    action: "SUPPLIER_UPDATE",
    entityType: "Supplier",
    entityId: item.id,
    comment: item.name,
    metadata: {
      old: {
        name: existing.name,
        phone: existing.phone,
        isActive: existing.isActive,
      },
      new: {
        name: item.name,
        phone: item.phone,
        isActive: item.isActive,
      },
    },
  });

  return item;
}

export async function assertSupplierInCompany(
  companyId: string,
  supplierId: string | null | undefined
) {
  if (!supplierId) return null;
  const s = await prisma.supplier.findFirst({
    where: { id: supplierId, companyId, isActive: true },
  });
  if (!s) throw new Error("SUPPLIER_NOT_FOUND");
  return s;
}
