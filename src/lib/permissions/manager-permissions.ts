import { ManagerScopeMode, Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_MANAGER_GRANTS,
  GRANTABLE_KEY_SET,
  NEVER_GRANTABLE_SET,
  type ManagerPermissionKey,
} from "@/lib/permissions/keys";
import { logActivity } from "@/lib/services/activity-log.service";

/** Minimal user shape — avoid circular import with rbac.ts */
export type PermUser = {
  id: string;
  role: Role | string;
  companyId: string;
  storeId?: string | null;
};

function isOwnerClass(role: Role | string | undefined | null): boolean {
  return role === Role.OWNER || role === Role.ADMIN;
}

export type ManagerAuthz = {
  permissions: Set<string>;
  scopeMode: ManagerScopeMode;
  /** Resolved store ids allowed; empty = none; null = all company stores */
  allowedStoreIds: string[] | null;
};

const authzCache = new WeakMap<object, Promise<ManagerAuthz>>();

export function hasPermission(
  authz: ManagerAuthz | null | undefined,
  key: string
): boolean {
  if (!authz) return false;
  return authz.permissions.has(key);
}

export async function loadManagerAuthz(
  user: PermUser
): Promise<ManagerAuthz> {
  if (user.role !== Role.MANAGER) {
    return {
      permissions: new Set(),
      scopeMode: ManagerScopeMode.LEGACY_SINGLE,
      allowedStoreIds: user.storeId ? [user.storeId] : [],
    };
  }

  const cached = authzCache.get(user as object);
  if (cached) return cached;

  const promise = (async (): Promise<ManagerAuthz> => {
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        storeId: true,
        managerScopeMode: true,
        managerPermissions: {
          where: { enabled: true },
          select: { key: true },
        },
        managerStoreAccess: { select: { storeId: true } },
      },
    });

    if (!row) {
      return {
        permissions: new Set(),
        scopeMode: ManagerScopeMode.LEGACY_SINGLE,
        allowedStoreIds: [],
      };
    }

    const permissions = new Set(
      row.managerPermissions.map((p) => p.key).filter((k) => GRANTABLE_KEY_SET.has(k))
    );

    // If no rows yet (pre-backfill), apply defaults in-memory and persist lazily
    if (row.managerPermissions.length === 0) {
      for (const k of DEFAULT_MANAGER_GRANTS) permissions.add(k);
      await ensureDefaultPermissions(user.id).catch(() => undefined);
    }

    const mode = row.managerScopeMode;
    let allowedStoreIds: string[] | null;

    if (mode === ManagerScopeMode.ALL_STORES) {
      allowedStoreIds = null;
    } else if (mode === ManagerScopeMode.SELECTED_STORES) {
      allowedStoreIds = row.managerStoreAccess.map((a) => a.storeId);
    } else {
      // LEGACY_SINGLE
      allowedStoreIds = row.storeId ? [row.storeId] : [];
    }

    return { permissions, scopeMode: mode, allowedStoreIds };
  })();

  authzCache.set(user as object, promise);
  return promise;
}

export async function ensureDefaultPermissions(userId: string): Promise<void> {
  const existing = await prisma.managerPermission.count({ where: { userId } });
  if (existing > 0) return;
  await prisma.managerPermission.createMany({
    data: DEFAULT_MANAGER_GRANTS.map((key) => ({
      userId,
      key,
      enabled: true,
    })),
    skipDuplicates: true,
  });
}

/** OWNER bypass; MANAGER needs key; others false. */
export async function userHasPermission(
  user: PermUser,
  key: ManagerPermissionKey | string
): Promise<boolean> {
  if (isOwnerClass(user.role)) return true;
  if (user.role !== Role.MANAGER) return false;
  const authz = await loadManagerAuthz(user);
  return hasPermission(authz, key);
}

export function requirePermissionResponse(
  allowed: boolean
): NextResponse | null {
  if (allowed) return null;
  return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
}

export async function requirePermission(
  user: PermUser | null | undefined,
  key: ManagerPermissionKey | string
): Promise<NextResponse | null> {
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (isOwnerClass(user.role)) return null;
  if (user.role !== Role.MANAGER) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  const ok = await userHasPermission(user, key);
  return requirePermissionResponse(ok);
}

export function storeInScope(
  authz: ManagerAuthz,
  storeId: string | null | undefined
): boolean {
  if (!storeId) return false;
  if (authz.allowedStoreIds === null) return true;
  return authz.allowedStoreIds.includes(storeId);
}

/**
 * MANAGER store access (multi-scope). OWNER/ADMIN → null (allow).
 * SELLER → not handled here (null = skip).
 */
export async function assertStoreInScope(
  user: PermUser,
  storeId: string | null | undefined
): Promise<NextResponse | null> {
  if (isOwnerClass(user.role)) return null;
  if (user.role !== Role.MANAGER) return null;

  const authz = await loadManagerAuthz(user);
  if (!storeInScope(authz, storeId)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  return null;
}

/**
 * Filter for list queries.
 * - OWNER: undefined (no filter)
 * - MANAGER ALL: undefined
 * - MANAGER selected/legacy: storeIds array (may be empty)
 */
export async function resolveManagerStoreFilter(
  user: PermUser
): Promise<{ mode: "all" | "ids"; storeIds?: string[] }> {
  if (isOwnerClass(user.role)) return { mode: "all" };
  if (user.role !== Role.MANAGER) {
    return { mode: "ids", storeIds: user.storeId ? [user.storeId] : [] };
  }
  const authz = await loadManagerAuthz(user);
  if (authz.allowedStoreIds === null) return { mode: "all" };
  return { mode: "ids", storeIds: authz.allowedStoreIds };
}

export type ManagerPermissionsPayload = {
  userId: string;
  role: string;
  scopeMode: ManagerScopeMode;
  storeIds: string[];
  permissions: Record<string, boolean>;
};

export async function getManagerPermissionsState(
  companyId: string,
  managerId: string
): Promise<ManagerPermissionsPayload | null> {
  const manager = await prisma.user.findFirst({
    where: { id: managerId, companyId, role: Role.MANAGER },
    select: {
      id: true,
      role: true,
      storeId: true,
      managerScopeMode: true,
      managerPermissions: { select: { key: true, enabled: true } },
      managerStoreAccess: { select: { storeId: true } },
    },
  });
  if (!manager) return null;

  const permissions: Record<string, boolean> = {};
  for (const k of GRANTABLE_KEY_SET) permissions[k] = false;
  if (manager.managerPermissions.length === 0) {
    for (const k of DEFAULT_MANAGER_GRANTS) permissions[k] = true;
  } else {
    for (const p of manager.managerPermissions) {
      if (GRANTABLE_KEY_SET.has(p.key)) permissions[p.key] = p.enabled;
    }
  }

  let storeIds: string[] = [];
  if (manager.managerScopeMode === ManagerScopeMode.SELECTED_STORES) {
    storeIds = manager.managerStoreAccess.map((a) => a.storeId);
  } else if (manager.managerScopeMode === ManagerScopeMode.LEGACY_SINGLE) {
    storeIds = manager.storeId ? [manager.storeId] : [];
  }

  return {
    userId: manager.id,
    role: manager.role,
    scopeMode: manager.managerScopeMode,
    storeIds,
    permissions,
  };
}

export async function saveManagerPermissions(params: {
  actorId: string;
  companyId: string;
  managerId: string;
  scopeMode: ManagerScopeMode;
  storeIds: string[];
  permissions: Record<string, boolean>;
}): Promise<ManagerPermissionsPayload> {
  const manager = await prisma.user.findFirst({
    where: {
      id: params.managerId,
      companyId: params.companyId,
      role: Role.MANAGER,
    },
    select: { id: true },
  });
  if (!manager) throw new Error("NOT_FOUND");

  const cleaned: Record<string, boolean> = {};
  for (const [key, enabled] of Object.entries(params.permissions)) {
    if (NEVER_GRANTABLE_SET.has(key)) continue;
    if (!GRANTABLE_KEY_SET.has(key)) continue;
    cleaned[key] = Boolean(enabled);
  }

  let storeIds = [...new Set(params.storeIds.filter(Boolean))];
  if (params.scopeMode === ManagerScopeMode.SELECTED_STORES && storeIds.length) {
    const valid = await prisma.store.findMany({
      where: { companyId: params.companyId, id: { in: storeIds } },
      select: { id: true },
    });
    storeIds = valid.map((s) => s.id);
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: params.managerId },
      data: { managerScopeMode: params.scopeMode },
    });

    await tx.managerPermission.deleteMany({
      where: { userId: params.managerId },
    });
    const rows = Object.entries(cleaned).map(([key, enabled]) => ({
      userId: params.managerId,
      key,
      enabled,
    }));
    if (rows.length) {
      await tx.managerPermission.createMany({ data: rows });
    }

    await tx.managerStoreAccess.deleteMany({
      where: { userId: params.managerId },
    });
    if (
      params.scopeMode === ManagerScopeMode.SELECTED_STORES &&
      storeIds.length
    ) {
      await tx.managerStoreAccess.createMany({
        data: storeIds.map((storeId) => ({
          userId: params.managerId,
          storeId,
        })),
      });
    }

    // Keep primary storeId for LEGACY / first selected (compat)
    if (params.scopeMode === ManagerScopeMode.LEGACY_SINGLE) {
      // leave storeId as-is
    } else if (
      params.scopeMode === ManagerScopeMode.SELECTED_STORES &&
      storeIds[0]
    ) {
      await tx.user.update({
        where: { id: params.managerId },
        data: { storeId: storeIds[0] },
      });
    }
  });

  await logActivity({
    userId: params.actorId,
    companyId: params.companyId,
    action: "MANAGER_PERMISSIONS_UPDATE",
    entityType: "User",
    entityId: params.managerId,
    metadata: {
      scopeMode: params.scopeMode,
      storeIds,
      permissions: cleaned,
    },
  });

  const state = await getManagerPermissionsState(
    params.companyId,
    params.managerId
  );
  if (!state) throw new Error("NOT_FOUND");
  return state;
}

export async function backfillAllManagers(companyId?: string): Promise<number> {
  const managers = await prisma.user.findMany({
    where: {
      role: Role.MANAGER,
      ...(companyId ? { companyId } : {}),
    },
    select: { id: true },
  });
  for (const m of managers) {
    await ensureDefaultPermissions(m.id);
  }
  return managers.length;
}
