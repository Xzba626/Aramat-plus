import { prisma } from "@/lib/prisma";

export async function listSuppliers(
  companyId: string,
  opts?: { activeOnly?: boolean }
) {
  return prisma.supplier.findMany({
    where: {
      companyId,
      ...(opts?.activeOnly ? { isActive: true } : {}),
    },
    orderBy: { name: "asc" },
  });
}

export async function createSupplier(
  companyId: string,
  data: { name: string; phone?: string | null; comment?: string | null }
) {
  return prisma.supplier.create({
    data: {
      companyId,
      name: data.name.trim(),
      phone: data.phone?.trim() || null,
      comment: data.comment?.trim() || null,
    },
  });
}

export async function updateSupplier(
  companyId: string,
  id: string,
  data: {
    name?: string;
    phone?: string | null;
    comment?: string | null;
    isActive?: boolean;
  }
) {
  const existing = await prisma.supplier.findFirst({
    where: { id, companyId },
  });
  if (!existing) throw new Error("SUPPLIER_NOT_FOUND");

  return prisma.supplier.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.phone !== undefined
        ? { phone: data.phone?.trim() || null }
        : {}),
      ...(data.comment !== undefined
        ? { comment: data.comment?.trim() || null }
        : {}),
      ...(typeof data.isActive === "boolean" ? { isActive: data.isActive } : {}),
    },
  });
}

export async function getActiveSupplier(
  companyId: string,
  supplierId: string
) {
  return prisma.supplier.findFirst({
    where: { id: supplierId, companyId, isActive: true },
  });
}
