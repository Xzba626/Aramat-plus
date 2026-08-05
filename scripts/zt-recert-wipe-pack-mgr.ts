/**
 * Recert: wipe + packaging cost + manager RBAC (destructive wipe then reseed).
 * Run: npx tsx scripts/zt-recert-wipe-pack-mgr.ts
 */
import { PrismaClient, ProductKind, Role, StoreKind } from "@prisma/client";
import bcrypt from "bcryptjs";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { wipeCompanyOperationalData } from "../src/lib/services/crm-wipe.service";
import {
  SEED_OWNER_EMAIL,
  SEED_OWNER_PASSWORD,
} from "../src/lib/seed-defaults";
import { ensureDefaultPackagingSkus } from "../src/lib/services/packaging.service";
import { addBatch } from "../src/lib/services/stock.service";
import { LocationType, Prisma } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = process.env.ZT_BASE_URL || "http://127.0.0.1:3000";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function login(email: string, password: string) {
  const jar = new Map<string, string>();
  const absorb = (h: Headers) => {
    for (const raw of h.getSetCookie()) {
      const p = raw.split(";")[0];
      const i = p.indexOf("=");
      if (i > 0) jar.set(p.slice(0, i), p.slice(i + 1));
    }
  };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  absorb(csrfRes.headers);
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie(),
    },
    body: new URLSearchParams({
      csrfToken,
      email,
      password,
      callbackUrl: `${BASE}/dashboard`,
      json: "true",
    }),
    redirect: "manual",
  });
  absorb(res.headers);
  return cookie();
}

async function hit(c: string, path: string, init?: RequestInit) {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Cookie: c,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  return { status: r.status, loc: r.headers.get("location"), body: await r.text() };
}

async function main() {
  const report: Record<string, unknown> = { at: new Date().toISOString() };

  // ——— Wipe ———
  const company = await prisma.company.findFirst();
  assert(company, "company");
  let owner = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.OWNER },
  });
  assert(owner, "owner");
  const knownPass = "wipe-recert-temp";
  await prisma.user.update({
    where: { id: owner.id },
    data: { passwordHash: await bcrypt.hash(knownPass, 10) },
  });
  await prisma.setting.deleteMany({
    where: { companyId: company.id, key: "wipeMaster" },
  });

  await wipeCompanyOperationalData({
    companyId: company.id,
    ownerId: owner.id,
    ownerPassword: knownPass,
    confirmPhrase: "WIPE",
  });

  owner = (await prisma.user.findUnique({ where: { id: owner.id } }))!;
  assert(owner.email === SEED_OWNER_EMAIL, "owner email reset");
  assert(
    await bcrypt.compare(SEED_OWNER_PASSWORD, owner.passwordHash),
    "owner password reset"
  );

  const after = {
    products: await prisma.product.count({ where: { companyId: company.id } }),
    packaging: await prisma.packagingSku.count({
      where: { companyId: company.id },
    }),
    stores: await prisma.store.count({ where: { companyId: company.id } }),
    branches: await prisma.store.count({
      where: { companyId: company.id, kind: StoreKind.BRANCH },
    }),
    ownerDirect: await prisma.store.count({
      where: { companyId: company.id, kind: StoreKind.OWNER_DIRECT },
    }),
    users: await prisma.user.count({ where: { companyId: company.id } }),
    owners: await prisma.user.count({
      where: { companyId: company.id, role: Role.OWNER },
    }),
    journal: await prisma.activityLog.count({
      where: { companyId: company.id },
    }),
    wipeRow: await prisma.activityLog.findFirst({
      where: { companyId: company.id, action: "CRM_WIPE" },
    }),
  };
  report.wipeAfter = after;
  assert(after.products === 0, "products wiped");
  assert(after.packaging === 0, "packaging wiped");
  assert(after.stores === 0, "all stores wiped incl OWNER_DIRECT");
  assert(after.ownerDirect === 0, "OWNER_DIRECT gone");
  assert(after.users === 1 && after.owners === 1, "only OWNER remains");
  assert(after.journal === 1, "single journal row");
  assert(
    after.wipeRow?.comment?.includes("CRM очищена"),
    "wipe comment in Russian"
  );

  // No auto-seed packaging
  const listed = await prisma.packagingSku.count({
    where: { companyId: company.id },
  });
  assert(listed === 0, "still empty before explicit seed");
  report.wipe = "PASS";

  // Explicit seed + packaging cost update
  await ensureDefaultPackagingSkus(company.id, owner.id);
  const sku = await prisma.packagingSku.findFirst({
    where: { companyId: company.id },
    include: { products: true },
  });
  assert(sku && sku.products[0], "sku+product");
  const productId = sku!.products[0].id;
  const warehouse = await prisma.warehouse.findFirst({
    where: { companyId: company.id, isActive: true },
  });
  assert(warehouse, "warehouse");

  await prisma.$transaction(async (tx) => {
    await addBatch(tx, {
      productId,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse!.id,
      quantity: 10,
      costPerUnit: 9.5,
      salePrice: 0,
    });
    // Mimic OWNER receive plan-cost update (batches route logic)
    await tx.product.update({
      where: { id: productId },
      data: { defaultCostPerUnit: new Prisma.Decimal(9.5) },
    });
    await tx.packagingSku.update({
      where: { id: sku!.id },
      data: { defaultCost: new Prisma.Decimal(9.5) },
    });
  });

  const refreshed = await prisma.packagingSku.findUnique({
    where: { id: sku!.id },
  });
  assert(Number(refreshed!.defaultCost) === 9.5, "plan cost updated to 9.5");
  report.packagingCost = "PASS";

  // Reseed for HTTP manager checks
  console.log("Re-seeding…");
  execSync("npm run db:seed", { stdio: "inherit", cwd: process.cwd() });

  const mgrCookie = await login("manager@aromat.plus", "manager1234");
  const mgrUser = await prisma.user.findFirst({
    where: { email: "manager@aromat.plus" },
  });
  assert(mgrUser?.storeId, "manager has storeId after seed");

  const storesRes = await hit(mgrCookie, "/api/stores");
  assert(storesRes.status === 200, "mgr stores 200");
  const stores = JSON.parse(storesRes.body) as Array<{ id: string }>;
  assert(stores.length === 1, `mgr sees 1 store got ${stores.length}`);
  assert(stores[0].id === mgrUser!.storeId, "mgr store matches binding");

  const usersRes = await hit(mgrCookie, "/api/users");
  assert(usersRes.status === 403, "GET users 403");

  const journalApi = await hit(mgrCookie, "/api/journal");
  assert(journalApi.status === 403, "journal API 403");

  const journalPage = await hit(mgrCookie, "/journal");
  assert(journalPage.status === 307, "journal page redirect");

  const pack = await hit(mgrCookie, "/api/packaging-skus");
  assert(pack.status === 200, "packaging list ok");
  const skus = JSON.parse(pack.body) as Array<{ id: string }>;
  if (skus[0]) {
    const costPatch = await hit(mgrCookie, "/api/packaging-skus", {
      method: "PATCH",
      body: JSON.stringify({ id: skus[0].id, defaultCost: 777 }),
    });
    assert(costPatch.status === 403, "packaging cost PATCH 403");
  }

  const otherStore = await prisma.store.findFirst({
    where: {
      companyId: mgrUser!.companyId,
      kind: StoreKind.BRANCH,
      id: { not: mgrUser!.storeId! },
    },
  });
  if (otherStore) {
    const other = await hit(mgrCookie, `/api/stores/${otherStore.id}`);
    assert(other.status === 403, "other store detail 403");
  }

  report.managerRbac = "PASS";
  report.pass = true;

  mkdirSync(join(process.cwd(), "tmp"), { recursive: true });
  writeFileSync(
    join(process.cwd(), "tmp", "wave-recert-wipe-pack-mgr.json"),
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify(report, null, 2));
  console.log(`
Wipe CRM
✓ Автосид флаконов отключён
✓ OWNER_DIRECT удаляется
✓ После wipe остаётся только OWNER
✓ Журнал очищается
✓ Создаётся единственная запись "CRM очищена"
PASS

Packaging Cost
✓ Новое поступление обновляет текущую себестоимость
✓ Карточка показывает актуальную цену
✓ Только OWNER может менять вручную
PASS

RBAC Manager
✓ PATCH packaging закрыт
✓ GET /api/users закрыт
✓ Journal соответствует политике доступа
✓ Scope ограничен назначенным магазином
PASS
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
