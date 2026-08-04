/**
 * Prove finance product rankings exclude ProductKind.PACKAGING (bottles).
 * Run: npx tsx scripts/zt-packaging-analytics-proof.ts
 */
import { PrismaClient, ProductKind } from "@prisma/client";
import { getAnalyticsBreakdown } from "../src/lib/services/analytics.service";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.findFirst();
  if (!company) throw new Error("NO_COMPANY");

  const packaging = await prisma.product.findMany({
    where: { companyId: company.id, kind: ProductKind.PACKAGING, isActive: true },
    select: { id: true, name: true },
  });

  const data = await getAnalyticsBreakdown(company.id, "month");
  const names = [
    ...(data.topSales ?? []).map((p: { name: string }) => p.name),
    ...data.products.map((p: { name: string }) => p.name),
    ...data.topUnsold.map((p: { name: string }) => p.name),
    ...(data.noSales ?? []).map((p: { name: string }) => p.name),
  ];

  const leaks = packaging.filter((p) => names.includes(p.name));
  const ztLeft = await prisma.product.findMany({
    where: {
      companyId: company.id,
      OR: [
        { name: { startsWith: "ZT ", mode: "insensitive" } },
        { name: { equals: "100 мл" } },
      ],
    },
    select: { id: true, name: true, kind: true, isActive: true },
  });

  const out = {
    at: new Date().toISOString(),
    packagingActive: packaging.length,
    packagingNames: packaging.map((p) => p.name),
    topSellingSample: data.products.slice(0, 8).map((p: { name: string }) => p.name),
    topUnsoldSample: data.topUnsold.slice(0, 12).map((p: { name: string }) => p.name),
    packagingLeakedIntoRankings: leaks.map((p) => p.name),
    ztArtifactsRemaining: ztLeft,
    pass: leaks.length === 0 && ztLeft.length === 0,
  };

  mkdirSync(join(process.cwd(), "tmp"), { recursive: true });
  writeFileSync(
    join(process.cwd(), "tmp", "wave-packaging-analytics.json"),
    JSON.stringify(out, null, 2)
  );
  console.log(JSON.stringify(out, null, 2));
  if (!out.pass) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
