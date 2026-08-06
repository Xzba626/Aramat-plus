import { Role } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import {
  isOwnerClass,
  requireOwner,
  requireOwnerOrManager,
} from "@/lib/rbac";
import {
  packagingSkuSchema,
  packagingSkuUpdateSchema,
} from "@/lib/validators";
import { jsonOk, handleApiError, jsonError } from "@/lib/api";
import { NextResponse } from "next/server";
import {
  PackagingDuplicateError,
  createPackagingSku,
  ensureDefaultPackagingSkus,
  listPackagingSkus,
  updatePackagingSku,
} from "@/lib/services/packaging.service";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    // No auto-seed — empty after wipe until owner creates SKUs or seeds explicitly
    const sp = new URL(req.url).searchParams;
    const archived = sp.get("archived");
    const items = await listPackagingSkus(user!.companyId, {
      includeInactive: archived === "1" || archived === "all",
    });
    const rows =
      archived === "1"
        ? items.filter((s) => !s.isActive)
        : archived === "all"
          ? items
          : items.filter((s) => s.isActive);
    return jsonOk(rows);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwner(user);
    if (denied) return denied;
    const raw = await req.json();

    // Explicit owner action: create standard bottle set
    if (raw?.seedDefaults === true) {
      const created = await ensureDefaultPackagingSkus(
        user!.companyId,
        user!.id
      );
      return jsonOk({ ok: true, created }, 201);
    }

    const body = packagingSkuSchema.parse(raw);
    const { sku, product } = await createPackagingSku({
      companyId: user!.companyId,
      actorId: user!.id,
      data: body,
    });
    return jsonOk({ ...sku, productId: product.id }, 201);
  } catch (err) {
    if (err instanceof PackagingDuplicateError) {
      return NextResponse.json(
        { error: "PACKAGING_DUPLICATE", existingId: err.existingId },
        { status: 409 }
      );
    }
    return handleApiError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getSessionUser();
    const denied = requireOwnerOrManager(user);
    if (denied) return denied;
    const body = packagingSkuUpdateSchema.parse(await req.json());
    const { id, ...data } = body;
    if (!Object.keys(data).length) return jsonError("VALIDATION", 400);

    // Financial field — OWNER only
    if (data.defaultCost !== undefined && !isOwnerClass(user!.role)) {
      return jsonError("FORBIDDEN", 403);
    }

    // Store managers may archive/restore only; create/edit name+cost = owner
    if (user!.role === Role.MANAGER) {
      const allowed = Object.keys(data).every((k) => k === "isActive");
      if (!allowed) return jsonError("FORBIDDEN", 403);
    }

    const sku = await updatePackagingSku({
      companyId: user!.companyId,
      actorId: user!.id,
      id,
      data,
    });
    return jsonOk(sku);
  } catch (err) {
    if (err instanceof PackagingDuplicateError) {
      return NextResponse.json(
        { error: "PACKAGING_DUPLICATE", existingId: err.existingId },
        { status: 409 }
      );
    }
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return jsonError("NOT_FOUND", 404);
    }
    return handleApiError(err);
  }
}
