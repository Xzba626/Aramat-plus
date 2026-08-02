import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(
    `DROP INDEX IF EXISTS "PackagingSku_companyId_volumeMl_material_color_cap_key"`
  );
  await prisma.$executeRawUnsafe(`UPDATE "PackagingSku" SET "cap" = ''`);
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "PackagingSku_companyId_volumeMl_material_color_key" ON "PackagingSku"("companyId", "volumeMl", "material", "color")`
  );
  console.log("OK: PackagingSku unique without cap");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
