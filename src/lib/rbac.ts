import { Role } from "@prisma/client";
import { NextResponse } from "next/server";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  companyId: string;
  storeId?: string | null;
};

const OWNER_MANAGER: Role[] = [Role.OWNER, Role.MANAGER];

export function hasRole(user: SessionUser | null | undefined, roles: Role[]): boolean {
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!roles.includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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

export function homePathForRole(role: Role): string {
  if (role === Role.SELLER) return "/pos";
  return "/dashboard";
}
