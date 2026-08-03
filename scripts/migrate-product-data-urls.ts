/**
 * Idempotent migration: Product.imageUrl data: URLs → /uploads/products/*-md.webp
 *
 * Run: npx tsx scripts/migrate-product-data-urls.ts
 * Report: tmp/photo-data-url-migration.json
 *
 * Safety:
 * - Does not clear old value until new path is written
 * - Skips rows already on /uploads/
 * - Re-run safe (idempotent)
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/prisma";
import { migrateDataUrlToUploads } from "../src/lib/services/product-image.service";

async function main() {
  const rows = await prisma.product.findMany({
    where: { imageUrl: { startsWith: "data:" } },
    select: { id: true, name: true, imageUrl: true },
  });

  const report = {
    at: new Date().toISOString(),
    found: rows.length,
    migrated: [] as string[],
    failed: [] as { id: string; reason: string }[],
    skipped: [] as string[],
  };

  for (const row of rows) {
    const url = row.imageUrl ?? "";
    if (!url.startsWith("data:image/")) {
      report.skipped.push(row.id);
      continue;
    }
    // Already tiny / invalid length — still try once
    try {
      const result = await migrateDataUrlToUploads(url, {
        baseName: `mig-${row.id.slice(-8)}-${Date.now().toString(36)}`,
      });
      if (!result) {
        report.failed.push({ id: row.id, reason: "decode_failed" });
        continue;
      }
      // Only replace after successful write
      await prisma.product.update({
        where: { id: row.id },
        data: { imageUrl: result.imageUrl },
      });
      report.migrated.push(row.id);
      console.log("migrated", row.id, result.imageUrl);
    } catch (e) {
      report.failed.push({
        id: row.id,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Second pass: anything still data: counts as failed leftover
  const leftover = await prisma.product.count({
    where: { imageUrl: { startsWith: "data:" } },
  });
  const out = { ...report, leftoverDataUrls: leftover };

  mkdirSync(join(process.cwd(), "tmp"), { recursive: true });
  writeFileSync(
    join(process.cwd(), "tmp", "photo-data-url-migration.json"),
    JSON.stringify(out, null, 2)
  );
  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
  process.exit(out.failed.length > 0 && out.migrated.length === 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
