import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { homePathForRole as homePath } from "@/lib/auth.config";
import {
  assertStoreInScope,
  requirePermission as requireManagerPermission,
  resolveManagerStoreFilter,
  userHasPermission,
} from "@/lib/permissions/manager-permissions";
import type { ManagerPermissionKey } from "@/lib/permissions/keys";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  companyId: string;
  storeId?: string | null;
};

/** Owner-class roles (full company scope, finance). */
export const OWNER_ROLES: Role[] = [Role.OWNER, Role.ADMIN];

const OWNER_MANAGER: Role[] = [Role.OWNER, Role.ADMIN, Role.MANAGER];

export function isOwnerClass(role: Role | string | undefined | null): boolean {
  return role === Role.OWNER || role === Role.ADMIN;
}

export function hasRole(
  user: SessionUser | null | undefined,
  roles: Role[]
): boolean {
  if (!user) return false;
  return roles.includes(user.role);
}

export function canManageUsers(user: SessionUser): boolean {
  return isOwnerClass(user.role);
}

export function canViewWarehouseFinance(user: SessionUser): boolean {
  return isOwnerClass(user.role);
}

export function canAccessOwnerArea(user: SessionUser): boolean {
  return OWNER_MANAGER.includes(user.role);
}

/** OWNER/ADMIN may apply a POS discount without DiscountRequest. */
export function canApplyDirectDiscount(
  role: Role | string | undefined | null
): boolean {
  return isOwnerClass(role);
}

/** Destructive wipe — OWNER only (not ADMIN). */
export function canWipeCompany(user: SessionUser): boolean {
  return user.role === Role.OWNER;
}

export function requireRole(
  user: SessionUser | null | undefined,
  roles: Role[]
): NextResponse | null {
  if (!user) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!roles.includes(user.role)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  return null;
}

export function requireOwnerOrManager(user: SessionUser | null | undefined) {
  return requireRole(user, OWNER_MANAGER);
}

export function requireOwner(user: SessionUser | null | undefined) {
  return requireRole(user, OWNER_ROLES);
}

export function requireSeller(user: SessionUser | null | undefined) {
  return requireRole(user, [Role.SELLER]);
}

/**
 * Legacy sync helper: MANAGER → single user.storeId.
 * Prefer resolveScopedStoreFilter / assertStoreInScope for multi-scope.
 * Returns null = no store filter (OWNER). undefined used historically as "all".
 */
export function scopedStoreId(
  user: SessionUser
): string | null | undefined {
  if (user.role === Role.MANAGER) return user.storeId ?? null;
  return undefined;
}

/**
 * Async scope filter for list queries.
 * - OWNER: { all: true }
 * - MANAGER ALL_STORES: { all: true }
 * - MANAGER selected/legacy: { storeIds }
 */
export async function resolveScopedStoreFilter(user: SessionUser): Promise<{
  all: boolean;
  storeIds: string[];
}> {
  const f = await resolveManagerStoreFilter(user);
  if (f.mode === "all") return { all: true, storeIds: [] };
  return { all: false, storeIds: f.storeIds ?? [] };
}

/**
 * 403 if MANAGER tries to touch a store outside scope.
 * OWNER/ADMIN/SELLER: no-op (SELLER checked elsewhere).
 */
export async function requireStoreAccess(
  user: SessionUser,
  storeId: string | null | undefined
): Promise<NextResponse | null> {
  return assertStoreInScope(user, storeId);
}

/** Sync legacy check — only User.storeId. Prefer async requireStoreAccess. */
export function requireStoreAccessLegacy(
  user: SessionUser,
  storeId: string | null | undefined
): NextResponse | null {
  if (user.role !== Role.MANAGER) return null;
  if (!user.storeId || !storeId || user.storeId !== storeId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  return null;
}

export async function requirePermission(
  user: SessionUser | null | undefined,
  key: ManagerPermissionKey | string
): Promise<NextResponse | null> {
  return requireManagerPermission(user, key);
}

export async function checkPermission(
  user: SessionUser,
  key: ManagerPermissionKey | string
): Promise<boolean> {
  return userHasPermission(user, key);
}

export function homePathForRole(role: Role): string {
  return homePath(role);
}
