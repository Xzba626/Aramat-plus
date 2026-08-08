/**
 * One-shot scrub of XSS / HTML payloads left in catalog labels
 * (e.g. QA brand "<script>alert(1)</script>").
 *
 * Usage (from project root, with DATABASE_URL set):
 *   npx tsx scripts/zt-scrub-unsafe-names.ts
 *   npx tsx scripts/zt-scrub-unsafe-names.ts --apply
 */
import { PrismaClient } from "@prisma/client";
import {
  containsUnsafeMarkup,
  scrubStoredLabel,
} from "../src/lib/security/sanitize-text";

const apply = process.argv.includes("--apply");
const prisma = new PrismaClient();

async function scrubTable(
  label: string,
  rows: Array<{ id: string; name: string }>,
  update: (id: string, name: string) => Promise<unknown>
) {
  let n = 0;
  for (const row of rows) {
    if (!containsUnsafeMarkup(row.name) && !/[<>]/.test(row.name)) continue;
    const next = scrubStoredLabel(row.name);
    console.log(`[${label}] ${row.id}: ${JSON.stringify(row.name)} → ${JSON.stringify(next)}`);
    if (apply) await update(row.id, next);
    n += 1;
  }
  return n;
}

async function main() {
  console.log(apply ? "APPLY mode" : "DRY-RUN (pass --apply to write)");

  const brands = await prisma.brand.findMany({ select: { id: true, name: true } });
  const categories = await prisma.category.findMany({
    select: { id: true, name: true },
  });
  const products = await prisma.product.findMany({
    select: { id: true, name: true, description: true },
  });
  const stores = await prisma.store.findMany({ select: { id: true, name: true } });
  const users = await prisma.user.findMany({ select: { id: true, name: true } });

  let total = 0;
  total += await scrubTable("Brand", brands, (id, name) =>
    prisma.brand.update({ where: { id }, data: { name } })
  );
  total += await scrubTable("Category", categories, (id, name) =>
    prisma.category.update({ where: { id }, data: { name } })
  );
  total += await scrubTable("Store", stores, (id, name) =>
    prisma.store.update({ where: { id }, data: { name } })
  );
  total += await scrubTable("User", users, (id, name) =>
    prisma.user.update({ where: { id }, data: { name } })
  );

  for (const p of products) {
    const nameBad =
      containsUnsafeMarkup(p.name) || /[<>]/.test(p.name);
    const descBad =
      p.description &&
      (containsUnsafeMarkup(p.description) || /[<>]/.test(p.description));
    if (!nameBad && !descBad) continue;
    const name = nameBad ? scrubStoredLabel(p.name) : p.name;
    const description = descBad
      ? scrubStoredLabel(p.description) || null
      : p.description;
    console.log(
      `[Product] ${p.id}: name=${JSON.stringify(p.name)}→${JSON.stringify(name)} desc scrub=${Boolean(descBad)}`
    );
    if (apply) {
      await prisma.product.update({
        where: { id: p.id },
        data: { name, description },
      });
    }
    total += 1;
  }

  console.log(`Done. ${total} row(s) ${apply ? "updated" : "would update"}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
