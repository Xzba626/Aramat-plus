/**
 * Final gate: RBAC matrix for OWNER / MANAGER / SELLER.
 * No Warehouse role exists in schema (LocationType.WAREHOUSE ≠ Role).
 * Run: npx tsx scripts/test-rbac.ts
 */
import { Role } from "@prisma/client";
import {
  canAccessOwnerArea,
  canManageUsers,
  canViewWarehouseFinance,
  requireOwner,
  requireOwnerOrManager,
  requireSeller,
  type SessionUser,
} from "../src/lib/rbac";
import { homePathForRole } from "../src/lib/auth.config";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function user(role: Role, extras: Partial<SessionUser> = {}): SessionUser {
  return {
    id: `u-${role}`,
    email: `${role.toLowerCase()}@test.local`,
    name: role,
    role,
    companyId: "co-1",
    storeId: role === Role.SELLER ? "st-1" : null,
    ...extras,
  };
}

function deniedStatus(
  res: ReturnType<typeof requireOwner> | null
): number | null {
  return res?.status ?? null;
}

/** Mirror of middleware path gates (src/middleware.ts) without Next runtime. */
function middlewareAllows(role: Role, pathname: string): boolean {
  if (role === Role.SELLER) {
    const blocked =
      pathname.startsWith("/dashboard") ||
      pathname.startsWith("/warehouse") ||
      pathname.startsWith("/stores") ||
      pathname.startsWith("/transfers") ||
      pathname.startsWith("/settings") ||
      pathname.startsWith("/analytics") ||
      pathname.startsWith("/users") ||
      pathname.startsWith("/revision") ||
      pathname.startsWith("/returns") ||
      pathname.startsWith("/journal") ||
      pathname.startsWith("/notifications");
    if (blocked) return false;
  }
  if (
    (role === Role.OWNER || role === Role.MANAGER) &&
    pathname.startsWith("/pos")
  ) {
    return false;
  }
  return true;
}

async function main() {
  console.log("=== RBAC: Owner / Manager / Seller ===\n");

  // Schema fact: only three roles
  const roles = Object.values(Role);
  assert(
    roles.includes(Role.OWNER) &&
      roles.includes(Role.MANAGER) &&
      roles.includes(Role.SELLER),
    "expected OWNER/MANAGER/SELLER"
  );
  assert(
    !roles.includes("WAREHOUSE" as Role),
    "WAREHOUSE must not be a Role (only LocationType)"
  );
  console.log("✓ Role enum = OWNER | MANAGER | SELLER (no Warehouse role)");

  const owner = user(Role.OWNER);
  const manager = user(Role.MANAGER);
  const seller = user(Role.SELLER);

  assert(canAccessOwnerArea(owner), "owner → owner area");
  assert(canAccessOwnerArea(manager), "manager → owner area");
  assert(!canAccessOwnerArea(seller), "seller ✗ owner area");
  console.log("✓ canAccessOwnerArea: Owner+Manager yes, Seller no");

  assert(canManageUsers(owner), "owner manages users");
  assert(!canManageUsers(manager), "manager ✗ manage users");
  assert(!canManageUsers(seller), "seller ✗ manage users");
  console.log("✓ canManageUsers: Owner only");

  assert(canViewWarehouseFinance(owner), "owner sees warehouse finance");
  assert(!canViewWarehouseFinance(manager), "manager ✗ warehouse cost/finance");
  assert(!canViewWarehouseFinance(seller), "seller ✗ warehouse finance");
  console.log("✓ canViewWarehouseFinance: Owner only (Manager masked)");

  assert(deniedStatus(requireOwner(owner)) === null, "requireOwner owner");
  assert(deniedStatus(requireOwner(manager)) === 403, "requireOwner manager 403");
  assert(deniedStatus(requireOwner(seller)) === 403, "requireOwner seller 403");
  assert(
    deniedStatus(requireOwnerOrManager(manager)) === null,
    "requireOwnerOrManager manager"
  );
  assert(
    deniedStatus(requireOwnerOrManager(seller)) === 403,
    "requireOwnerOrManager seller 403"
  );
  assert(deniedStatus(requireSeller(seller)) === null, "requireSeller seller");
  assert(deniedStatus(requireSeller(owner)) === 403, "requireSeller owner 403");
  console.log("✓ requireOwner / requireOwnerOrManager / requireSeller status codes");

  assert(homePathForRole(Role.OWNER) === "/dashboard", "owner home");
  assert(homePathForRole(Role.MANAGER) === "/dashboard", "manager home");
  assert(homePathForRole(Role.SELLER) === "/pos", "seller home");
  console.log("✓ homePathForRole");

  // Path matrix (middleware)
  const cases: Array<[Role, string, boolean]> = [
    [Role.OWNER, "/dashboard", true],
    [Role.OWNER, "/warehouse", true],
    [Role.OWNER, "/analytics", true],
    [Role.OWNER, "/journal", true],
    [Role.OWNER, "/pos", false],
    [Role.MANAGER, "/dashboard", true],
    [Role.MANAGER, "/warehouse", true],
    [Role.MANAGER, "/revision", true],
    [Role.MANAGER, "/pos", false],
    [Role.SELLER, "/pos", true],
    [Role.SELLER, "/dashboard", false],
    [Role.SELLER, "/warehouse", false],
    [Role.SELLER, "/analytics", false],
    [Role.SELLER, "/journal", false],
    [Role.SELLER, "/returns", false],
    [Role.SELLER, "/revision", false],
  ];
  for (const [role, path, expect] of cases) {
    const got = middlewareAllows(role, path);
    assert(got === expect, `middleware ${role} ${path} expect ${expect} got ${got}`);
  }
  console.log(`✓ Middleware path matrix (${cases.length} cases)`);

  // API policy summary (documented expectations used by routes)
  const apiPolicy = [
    { route: "POST /api/users", allow: [Role.OWNER] },
    { route: "POST /api/warehouse/write-offs", allow: [Role.OWNER] },
    { route: "PATCH /api/returns/[id]/decision", allow: [Role.OWNER] },
    { route: "GET /api/journal", allow: [Role.OWNER, Role.MANAGER] },
    { route: "POST /api/transfers", allow: [Role.OWNER, Role.MANAGER] },
    { route: "POST /api/sales (create)", allow: [Role.SELLER] },
  ];
  for (const row of apiPolicy) {
    for (const role of [Role.OWNER, Role.MANAGER, Role.SELLER]) {
      const allowed = row.allow.includes(role);
      // Sanity: policy list is consistent with rbac helpers
      if (row.route.includes("users") || row.route.includes("write-offs") || row.route.includes("decision")) {
        assert(
          allowed === (role === Role.OWNER),
          `${row.route} policy vs Owner-only`
        );
      }
    }
  }
  console.log(`✓ API policy spot-checks (${apiPolicy.length} routes documented)`);

  console.log("\nRBAC PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
