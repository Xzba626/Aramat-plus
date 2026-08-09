import { z } from "zod";
import { Role } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import {
  isOwnerClass,
  requireOwner,
  requireOwnerOrManager,
  requirePermission,
  requireStoreAccess,
  resolveScopedStoreFilter,
} from "@/lib/rbac";
import { handleApiError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";
import {
  approveInventorySession,
  cancelInventorySession,
  createInventorySession,
  getInventorySessionDetail,
  submitInventoryForApproval,
  updateInventoryCounts,
} from "@/lib/services/revision.service";
import { optionalPlainText } from "@/lib/validators";

const createSchema = z.object({
  storeId: z.string().min(1),
  comment: optionalPlainText(500),
});

const countSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        countedQty: z.coerce.number().min(0),
        reason: optionalPlainText(300),
      })
    )
    .min(1),
});

const decideSchema = z.object({
  decision: z.enum(["APPROVE", "CANCEL", "SUBMIT"]),
  note: optionalPlainText(500),
});

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    if (user!.role === Role.MANAGER) {
      const permDenied = await requirePermission(user, "inventory.audit.view");
      if (permDenied) return permDenied;
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (id) {
      const detail = await getInventorySessionDetail(
        user!.companyId,
        id,
        user!.role as Role
      );
      const scopeDenied = await requireStoreAccess(user!, detail.storeId);
      if (scopeDenied) return scopeDenied;
      return jsonOk(detail);
    }

    const scope = await resolveScopedStoreFilter(user!);
    const storeWhere = scope.all
      ? { companyId: user!.companyId }
      : scope.storeIds.length === 0
        ? { companyId: user!.companyId, id: "__none__" }
        : { companyId: user!.companyId, id: { in: scope.storeIds } };

    const isOwner = isOwnerClass(user!.role);
    const sessions = await prisma.inventorySession.findMany({
      where: { store: storeWhere },
      include: {
        store: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
        items: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return jsonOk(
      sessions.map((s) => {
        const variance = s.items.reduce((sum, it) => {
          return sum + Math.abs(decimalToNumber(it.difference));
        }, 0);
        return {
          id: s.id,
          storeId: s.store.id,
          store: s.store.name,
          createdBy: s.createdBy.name,
          approvedBy: s.approvedBy?.name ?? null,
          status: s.status,
          createdAt: s.createdAt.toISOString(),
          completedAt: s.completedAt?.toISOString() ?? null,
          itemCount: s.items.length,
          // Absolute variance leaks expected vs fact — Owner only.
          varianceAbs: isOwner ? Math.round(variance * 1000) / 1000 : 0,
          comment: s.comment,
        };
      })
    );
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;
    const body = createSchema.parse(await req.json());
    const scopeDenied = await requireStoreAccess(user!, body.storeId);
    if (scopeDenied) return scopeDenied;
    const row = await createInventorySession({
      companyId: user!.companyId,
      storeId: body.storeId,
      createdById: user!.id,
      comment: body.comment ?? undefined,
    });
    return jsonOk(row, 201);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return handleApiError(new Error("ID_REQUIRED"));

    const session = await prisma.inventorySession.findFirst({
      where: { id, store: { companyId: user!.companyId } },
      select: { storeId: true },
    });
    if (!session) return handleApiError(new Error("NOT_FOUND"));
    const scopeDenied = await requireStoreAccess(user!, session.storeId);
    if (scopeDenied) return scopeDenied;

    const raw = await req.json();
    if (raw.decision) {
      const body = decideSchema.parse(raw);
      if (body.decision === "SUBMIT") {
        return jsonOk(
          await submitInventoryForApproval({
            companyId: user!.companyId,
            sessionId: id,
            userId: user!.id,
          })
        );
      }
      if (body.decision === "APPROVE") {
        const ownerOnly = requireOwner(user);
        if (ownerOnly) return ownerOnly;
        return jsonOk(
          await approveInventorySession({
            companyId: user!.companyId,
            sessionId: id,
            approvedById: user!.id,
            note: body.note ?? undefined,
          })
        );
      }
      const isOwner = isOwnerClass(user!.role);
      return jsonOk(
        await cancelInventorySession({
          companyId: user!.companyId,
          sessionId: id,
          userId: user!.id,
          allowPending: isOwner,
        })
      );
    }

    const body = countSchema.parse(raw);
    return jsonOk(
      await updateInventoryCounts({
        companyId: user!.companyId,
        sessionId: id,
        userId: user!.id,
        items: body.items.map((it) => ({
          productId: it.productId,
          countedQty: it.countedQty,
          reason: it.reason ?? undefined,
        })),
      })
    );
  } catch (err) {
    return handleApiError(err);
  }
}
