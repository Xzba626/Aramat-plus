/**
 * Inspect + optionally purge Cursor proof-script artifacts (ZT / WaveG).
 * Dry-run by default. Pass --apply to delete.
 *
 * Run: npx tsx scripts/zt-purge-test-artifacts.ts
 * Apply: npx tsx scripts/zt-purge-test-artifacts.ts --apply
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

function isTestName(name: string): boolean {
  const n = name.trim();
  return (
    /^ZT\b/i.test(n) ||
    /^WaveG\b/i.test(n) ||
    /^ZT Rev\b/i.test(n) ||
    n === "100 мл" // orphan proof artifact seen in analytics
  );
}

async function main() {
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { name: { startsWith: "ZT ", mode: "insensitive" } },
        { name: { startsWith: "ZT", mode: "insensitive" } },
        { name: { startsWith: "WaveG ", mode: "insensitive" } },
        { name: { equals: "100 мл" } },
        { sku: { startsWith: "WG-", mode: "insensitive" } },
        { sku: { startsWith: "ZT", mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      name: true,
      sku: true,
      kind: true,
      isActive: true,
      companyId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const brands = await prisma.brand.findMany({
    where: {
      OR: [
        { name: { startsWith: "ZT ", mode: "insensitive" } },
        { name: { startsWith: "WaveG ", mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, companyId: true },
  });

  const categories = await prisma.category.findMany({
    where: {
      OR: [
        { name: { startsWith: "ZT ", mode: "insensitive" } },
        { name: { startsWith: "WaveG ", mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, companyId: true },
  });

  const stores = await prisma.store.findMany({
    where: {
      OR: [
        { name: { startsWith: "ZT ", mode: "insensitive" } },
        { address: { contains: "zt-", mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, address: true, companyId: true },
  });

  const packaging = await prisma.product.findMany({
    where: { kind: "PACKAGING", isActive: true },
    select: { id: true, name: true },
    take: 50,
  });

  const report = {
    mode: APPLY ? "APPLY" : "DRY_RUN",
    at: new Date().toISOString(),
    note:
      "ZT* / WaveG* rows are leftovers from local Cursor proof scripts that wrote into the same DB the owner uses (no separate test DB).",
    products: products.filter((p) => isTestName(p.name) || (p.sku ?? "").match(/^(ZT|WG-)/i)),
    brands,
    categories,
    stores,
    packagingActiveSample: packaging,
    packagingActiveCount: await prisma.product.count({
      where: { kind: "PACKAGING", isActive: true },
    }),
  };

  mkdirSync(join(process.cwd(), "tmp"), { recursive: true });
  writeFileSync(
    join(process.cwd(), "tmp", "zt-artifacts-scan.json"),
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify(report, null, 2));

  if (!APPLY) {
    console.log(
      "\nDry-run only. Re-run with --apply to delete listed ZT/WaveG products (+ related stock/batches/sale items if cascade)."
    );
    return;
  }

  const ids = report.products.map((p) => p.id);
  if (ids.length === 0) {
    console.log("Nothing to delete.");
    return;
  }

  // Soft-safe order: stock → batches → reservation items → transfer items → then product
  // SaleItems may block delete — deactivate instead if FK blocks.
  await prisma.stockBalance.deleteMany({ where: { productId: { in: ids } } });
  await prisma.batch.deleteMany({ where: { productId: { in: ids } } });
  await prisma.reservationItem.deleteMany({ where: { productId: { in: ids } } });
  await prisma.inventoryItem.deleteMany({ where: { productId: { in: ids } } }).catch(() => undefined);

  let deleted = 0;
  let deactivated = 0;
  for (const id of ids) {
    try {
      await prisma.product.delete({ where: { id } });
      deleted += 1;
    } catch {
      await prisma.product.update({
        where: { id },
        data: { isActive: false, name: `[ARCHIVED TEST] ${id}` },
      });
      deactivated += 1;
    }
  }

  // Orphan WaveG/ZT brands/categories with no products
  for (const b of brands) {
    const left = await prisma.product.count({ where: { brandId: b.id } });
    if (left === 0) await prisma.brand.delete({ where: { id: b.id } }).catch(() => undefined);
  }
  for (const c of categories) {
    const left = await prisma.product.count({ where: { categoryId: c.id } });
    if (left === 0)
      await prisma.category.delete({ where: { id: c.id } }).catch(() => undefined);
  }

  console.log(JSON.stringify({ deleted, deactivated, productIds: ids }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
