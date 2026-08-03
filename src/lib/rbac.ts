import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { homePathForRole as homePath } from "@/lib/auth.config";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  companyId: string;
  storeId?: string | null;
};

const OWNER_MANAGER: Role[] = [Role.OWNER, Role.MANAGER];

export function hasRole(
  user: SessionUser | null | undefined,
  roles: Role[]
): boolean {
  if (!user) return false;
  return roles.includes(user.role);
}

export function canManageUsers(user: SessionUser): boolean {
  return user.role === Role.OWNER;
}

export function canViewWarehouseFinance(user: SessionUser): boolean {
  return user.role === Role.OWNER;
}

export function canAccessOwnerArea(user: SessionUser): boolean {
  return OWNER_MANAGER.includes(user.role);
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
  return requireRole(user, [Role.OWNER]);
}

export function requireSeller(user: SessionUser | null | undefined) {
  return requireRole(user, [Role.SELLER]);
}

/**
 * Store Manager mode: MANAGER is scoped to user.storeId only.
 * OWNER sees the whole company. Returns null = no store filter (owner).
 */
export function scopedStoreId(
  user: SessionUser
): string | null | undefined {
  if (user.role === Role.MANAGER) return user.storeId ?? null;
  return undefined;
}

/** 403 if MANAGER tries to touch another store (or has no store). */
export function requireStoreAccess(
  user: SessionUser,
  storeId: string | null | undefined
): NextResponse | null {
  if (user.role !== Role.MANAGER) return null;
  if (!user.storeId || !storeId || user.storeId !== storeId) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }
  return null;
}

export function homePathForRole(role: Role): string {
  return homePath(role);
}
