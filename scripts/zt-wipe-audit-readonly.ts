/** Read-only: schema inventory for wipe audit. */
import { PrismaClient, Role, StoreKind } from "@prisma/client";
import { readFileSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

async function main() {
  const wipeSrc = readFileSync(
    join(process.cwd(), "src/lib/services/crm-wipe.service.ts"),
    "utf8"
  );
  const deletes = [...wipeSrc.matchAll(/tx\.(\w+)\.deleteMany/g)].map((m) => m[1]);
  const keeps = {
    reseedsOwnerDirect: wipeSrc.includes("OWNER_DIRECT"),
    reseedsWarehouse: wipeSrc.includes("Центральный склад"),
    resetsOwnerCreds: wipeSrc.includes("SEED_OWNER_EMAIL"),
    doesNotDeleteSettings: !wipeSrc.includes("setting.delete"),
    doesNotDeleteUnits: !wipeSrc.includes("unit.delete"),
    doesNotDeleteCompany: !wipeSrc.includes("company.delete"),
  };

  const company = await prisma.company.findFirst();
  const live = company
    ? {
        packagingSku: await prisma.packagingSku.count({
          where: { companyId: company.id },
        }),
        branch: await prisma.store.count({
          where: { companyId: company.id, kind: StoreKind.BRANCH },
        }),
        ownerDirect: await prisma.store.count({
          where: { companyId: company.id, kind: StoreKind.OWNER_DIRECT },
        }),
        ownerEmail: (
          await prisma.user.findFirst({
            where: { companyId: company.id, role: Role.OWNER },
          })
        )?.email,
      }
    : null;

  console.log(
    JSON.stringify(
      {
        wipeDeletes: deletes,
        keeps,
        seedLogin: "owner@aromat.plus / owner1234",
        live,
        packagingAutoSeed:
          "GET /api/packaging-skus?seedDefaults=1 → ensureDefaultPackagingSkus",
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
