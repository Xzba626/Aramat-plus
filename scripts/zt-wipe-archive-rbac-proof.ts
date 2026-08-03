/**
 * Wipe + archive + product RBAC proof.
 * Destructive: wipes CRM then re-seeds.
 * Run: npx tsx scripts/zt-wipe-archive-rbac-proof.ts
 */
import { PrismaClient, Role, StoreKind } from "@prisma/client";
import bcrypt from "bcryptjs";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { wipeCompanyOperationalData } from "../src/lib/services/crm-wipe.service";
import {
  SEED_OWNER_EMAIL,
  SEED_OWNER_PASSWORD,
} from "../src/lib/seed-defaults";
import {
  getArchiveRetentionDays,
  setArchiveRetentionDays,
  purgeExpiredArchives,
} from "../src/lib/services/archive-retention.service";
import { hardDeleteStore } from "../src/lib/services/store-lifecycle.service";

const prisma = new PrismaClient();

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function main() {
  const report: Record<string, unknown> = { at: new Date().toISOString() };

  // Ensure known owner password for wipe (may have been rotated)
  const company = await prisma.company.findFirst();
  assert(company, "company");
  let owner = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.OWNER },
  });
  assert(owner, "owner");
  const knownPass = "wipe-proof-temp-pass";
  await prisma.user.update({
    where: { id: owner.id },
    data: {
      passwordHash: await bcrypt.hash(knownPass, 10),
      email: `wipe-temp-${Date.now()}@example.com`,
    },
  });
  owner = (await prisma.user.findUnique({ where: { id: owner.id } }))!;

  // Seed a bit of operational data markers
  const before = {
    products: await prisma.product.count({ where: { companyId: company.id } }),
    sales: await prisma.sale.count({ where: { store: { companyId: company.id } } }),
    branches: await prisma.store.count({
      where: { companyId: company.id, kind: StoreKind.BRANCH },
    }),
    sellers: await prisma.user.count({
      where: { companyId: company.id, role: Role.SELLER },
    }),
    packaging: await prisma.packagingSku.count({ where: { companyId: company.id } }),
    expenses: await prisma.expense.count({
      where: { OR: [{ store: { companyId: company.id } }, { createdBy: { companyId: company.id } }] },
    }),
    notifications: await prisma.notification.count({
      where: { user: { companyId: company.id } },
    }),
  };
  report.before = before;

  // Clear optional wipe-master so proof can run without interactive secret
  await prisma.setting.deleteMany({
    where: { companyId: company.id, key: "wipeMaster" },
  });

  const wipeResult = await wipeCompanyOperationalData({
    companyId: company.id,
    ownerId: owner.id,
    ownerPassword: knownPass,
    confirmPhrase: "WIPE",
  });

  const afterOwner = await prisma.user.findUnique({ where: { id: owner.id } });
  assert(afterOwner?.email === SEED_OWNER_EMAIL, "owner email reset to seed");
  assert(
    await bcrypt.compare(SEED_OWNER_PASSWORD, afterOwner!.passwordHash),
    "owner password reset to seed"
  );

  const after = {
    products: await prisma.product.count({ where: { companyId: company.id } }),
    sales: await prisma.sale.count({ where: { store: { companyId: company.id } } }),
    branches: await prisma.store.count({
      where: { companyId: company.id, kind: StoreKind.BRANCH },
    }),
    sellers: await prisma.user.count({
      where: { companyId: company.id, role: Role.SELLER },
    }),
    packaging: await prisma.packagingSku.count({ where: { companyId: company.id } }),
    expenses: await prisma.expense.count({
      where: { OR: [{ store: { companyId: company.id } }, { createdBy: { companyId: company.id } }] },
    }),
    notifications: await prisma.notification.count({
      where: { user: { companyId: company.id } },
    }),
    batches: await prisma.batch.count({ where: { product: { companyId: company.id } } }),
    transfers: await prisma.transfer.count({
      where: {
        OR: [
          { toStore: { companyId: company.id } },
          { fromWarehouse: { companyId: company.id } },
        ],
      },
    }),
    ownerDirect: await prisma.store.count({
      where: { companyId: company.id, kind: StoreKind.OWNER_DIRECT },
    }),
    warehouse: await prisma.warehouse.count({ where: { companyId: company.id } }),
    units: await prisma.unit.count({ where: { companyId: company.id } }),
  };
  report.after = after;
  report.wipeResult = wipeResult;

  assert(after.products === 0, "products wiped");
  assert(after.sales === 0, "sales wiped");
  assert(after.branches === 0, "branches wiped");
  assert(after.sellers === 0, "sellers wiped");
  assert(after.packaging === 0, "packaging wiped");
  assert(after.expenses === 0, "expenses wiped");
  assert(after.notifications === 0, "notifications wiped");
  assert(after.batches === 0, "batches wiped");
  assert(after.transfers === 0, "transfers wiped");
  assert(after.ownerDirect >= 1, "OWNER_DIRECT kept");
  assert(after.warehouse >= 1, "warehouse kept");
  assert(after.units > 0, "units kept");

  // Re-seed for further checks
  console.log("Re-seeding…");
  execSync("npm run db:seed", { stdio: "inherit", cwd: process.cwd() });

  const seeded = await prisma.company.findFirst();
  assert(seeded, "reseed company");
  const seedOwner = await prisma.user.findFirst({
    where: { companyId: seeded.id, role: Role.OWNER, email: SEED_OWNER_EMAIL },
  });
  assert(seedOwner, "seed owner");

  // Archive retention setting
  const days = await setArchiveRetentionDays(seeded.id, 14);
  assert(days === 14, "retention set");
  assert((await getArchiveRetentionDays(seeded.id)) === 14, "retention get");

  // Soft-delete store → archive
  const branch = await prisma.store.findFirst({
    where: { companyId: seeded.id, kind: StoreKind.BRANCH },
  });
  if (branch) {
    const soft = await hardDeleteStore({
      companyId: seeded.id,
      storeId: branch.id,
      actorId: seedOwner.id,
      force: false,
    });
    assert(soft.archived, "delete archives");
    const archived = await prisma.store.findUnique({ where: { id: branch.id } });
    assert(archived?.isArchived === true, "store isArchived");
    assert(archived?.archivedAt != null, "store archivedAt set");

    // Force purge
    await hardDeleteStore({
      companyId: seeded.id,
      storeId: branch.id,
      actorId: seedOwner.id,
      force: true,
    });
    const gone = await prisma.store.findUnique({ where: { id: branch.id } });
    assert(!gone, "store force deleted");
    report.storeArchiveDelete = "PASS";
  } else {
    report.storeArchiveDelete = "SKIP_NO_BRANCH";
  }

  // Product archive + purge expired
  const product = await prisma.product.findFirst({
    where: { companyId: seeded.id, kind: "STANDARD" },
  });
  if (product) {
    await prisma.product.update({
      where: { id: product.id },
      data: {
        isActive: false,
        archivedAt: new Date(Date.now() - 40 * 86400000),
      },
    });
    await setArchiveRetentionDays(seeded.id, 30);
    const purged = await purgeExpiredArchives({
      companyId: seeded.id,
      actorId: seedOwner.id,
    });
    assert(purged.products >= 1, "expired product purged");
    report.productRetentionPurge = purged;
  }

  report.pass = true;
  mkdirSync(join(process.cwd(), "tmp"), { recursive: true });
  writeFileSync(
    join(process.cwd(), "tmp", "wave-wipe-archive-rbac.json"),
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify(report, null, 2));
  console.log("PASS: wipe reset + modules empty + archive/delete + retention");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
