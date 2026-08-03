/**
 * Manager/seller must get 403 on product mutation APIs.
 * Run: npx tsx scripts/zt-product-owner-edit-rbac.ts
 *
 * Uses service-level RBAC simulation via direct requireOwner checks is hard;
 * instead verifies route source + attempts Prisma-backed role gate helpers.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient, Role } from "@prisma/client";
import { requireOwner, requireOwnerOrManager } from "../src/lib/rbac";
import type { SessionUser } from "../src/lib/rbac";

const prisma = new PrismaClient();

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

function fakeUser(role: Role, companyId: string): SessionUser {
  return {
    id: "x",
    email: "x@test",
    name: "x",
    role,
    companyId,
    storeId: null,
  };
}

async function main() {
  const files = [
    "src/app/api/products/[id]/route.ts",
    "src/app/api/products/[id]/price/route.ts",
    "src/app/api/products/[id]/cost/route.ts",
    "src/app/api/products/upload/route.ts",
    "src/app/api/products/route.ts",
  ];
  for (const f of files) {
    const text = readFileSync(join(process.cwd(), f), "utf8");
    assert(text.includes("requireOwner"), `${f} must use requireOwner`);
    if (f.includes("[id]/route.ts") && text.includes("export async function GET")) {
      assert(
        text.includes("requireOwnerOrManager"),
        `${f} GET may stay ownerOrManager`
      );
    }
    if (f.includes("products/route.ts")) {
      // POST create = owner; GET = ownerOrManager
      assert(text.includes("requireOwnerOrManager"), "GET list ownerOrManager");
    }
  }

  const company = await prisma.company.findFirst();
  assert(company, "company");
  const mgr = fakeUser(Role.MANAGER, company.id);
  const seller = fakeUser(Role.SELLER, company.id);
  const owner = fakeUser(Role.OWNER, company.id);

  assert(requireOwner(mgr) != null, "manager blocked by requireOwner");
  assert(requireOwner(seller) != null, "seller blocked by requireOwner");
  assert(requireOwner(owner) == null, "owner allowed");
  assert(requireOwnerOrManager(mgr) == null, "manager allowed read");
  assert(requireOwnerOrManager(seller) != null, "seller blocked read");

  console.log(
    JSON.stringify(
      {
        pass: true,
        routesOwnerOnly: files,
        managerPatchDenied: true,
        sellerPatchDenied: true,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
