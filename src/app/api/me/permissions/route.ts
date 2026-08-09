import { Role } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import { isOwnerClass } from "@/lib/rbac";
import { jsonOk, handleApiError } from "@/lib/api";
import {
  getManagerPermissionsState,
  loadManagerAuthz,
} from "@/lib/permissions/manager-permissions";
import {
  GRANTABLE_KEY_SET,
  MANAGER_PERMISSION_KEYS,
} from "@/lib/permissions/keys";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return handleApiError(new Error("UNAUTHORIZED"));

    if (isOwnerClass(user.role)) {
      const permissions: Record<string, boolean> = {};
      for (const k of MANAGER_PERMISSION_KEYS) permissions[k] = true;
      return jsonOk({
        role: user.role,
        scopeMode: "ALL_STORES",
        storeIds: [] as string[],
        permissions,
        ownerBypass: true,
      });
    }

    if (user.role === Role.MANAGER) {
      const state = await getManagerPermissionsState(user.companyId, user.id);
      const authz = await loadManagerAuthz(user);
      return jsonOk({
        role: user.role,
        scopeMode: authz.scopeMode,
        storeIds:
          authz.allowedStoreIds === null ? [] : authz.allowedStoreIds,
        allStores: authz.allowedStoreIds === null,
        permissions: state?.permissions ??
          Object.fromEntries(
            [...GRANTABLE_KEY_SET].map((k) => [k, false])
          ),
        ownerBypass: false,
      });
    }

    return jsonOk({
      role: user.role,
      scopeMode: "LEGACY_SINGLE",
      storeIds: user.storeId ? [user.storeId] : [],
      permissions: {},
      ownerBypass: false,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
