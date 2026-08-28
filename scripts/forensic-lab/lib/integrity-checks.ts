/**
 * Database integrity + stock/batch consistency checks (raw SQL + Prisma).
 */
import { PrismaClient, LocationType } from "@prisma/client";

const prisma = new PrismaClient();

export type IntegrityResult = {
  check: string;
  passed: boolean;
  count: number;
  detail?: string;
};

export async function runDbIntegrityChecks(
  companyId: string
): Promise<IntegrityResult[]> {
  const results: IntegrityResult[] = [];

  const push = (check: string, count: number, passed: boolean, detail?: string) =>
    results.push({ check, count, passed, detail });

  const negStock = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*)::bigint AS c FROM "StockBalance" sb
    JOIN "Product" p ON p.id = sb."productId"
    WHERE p."companyId" = ${companyId} AND sb.quantity < 0`;
  push(
    "negative_stock_balance",
    Number(negStock[0]?.c ?? 0),
    Number(negStock[0]?.c ?? 0) === 0
  );

  const negBatch = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*)::bigint AS c FROM "Batch" b
    JOIN "Product" p ON p.id = b."productId"
    WHERE p."companyId" = ${companyId} AND b.quantity < 0`;
  push(
    "negative_batch_qty",
    Number(negBatch[0]?.c ?? 0),
    Number(negBatch[0]?.c ?? 0) === 0
  );

  const saleNoItems = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*)::bigint AS c FROM "Sale" s
    JOIN "Store" st ON st.id = s."storeId"
    WHERE st."companyId" = ${companyId}
      AND NOT EXISTS (SELECT 1 FROM "SaleItem" i WHERE i."saleId" = s.id)`;
  push(
    "sale_without_items",
    Number(saleNoItems[0]?.c ?? 0),
    Number(saleNoItems[0]?.c ?? 0) === 0
  );

  const orphanItems = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*)::bigint AS c FROM "SaleItem" i
    WHERE NOT EXISTS (SELECT 1 FROM "Sale" s WHERE s.id = i."saleId")`;
  push(
    "orphan_sale_items",
    Number(orphanItems[0]?.c ?? 0),
    Number(orphanItems[0]?.c ?? 0) === 0
  );

  const dupPhantom = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*)::bigint AS c FROM (
      SELECT s.id FROM "Sale" s
      JOIN "Store" st ON st.id = s."storeId"
      JOIN "SaleItem" i ON i."saleId" = s.id
      WHERE st."companyId" = ${companyId}
        AND s.status IN ('COMPLETED', 'PARTIAL_RETURN')
      GROUP BY s.id, s.total
      HAVING COUNT(i.id) > 3
    ) x`;
  push(
    "suspicious_sale_item_count_gt3",
    Number(dupPhantom[0]?.c ?? 0),
    Number(dupPhantom[0]?.c ?? 0) === 0,
    "FIFO may legitimately split; flag for manual review if >0"
  );

  return results;
}

/** StockBalance > 0 but no open Batch at same location — desync risk. */
export async function findStockBatchDesync(companyId: string) {
  return prisma.$queryRaw<
    Array<{
      product_id: string;
      location_type: string;
      location_id: string;
      stock_qty: number;
      batch_qty: number;
    }>
  >`
    SELECT sb."productId" AS product_id,
           sb."locationType" AS location_type,
           sb."locationId" AS location_id,
           sb.quantity::float AS stock_qty,
           COALESCE((
             SELECT SUM(b.quantity)::float FROM "Batch" b
             WHERE b."productId" = sb."productId"
               AND b."locationType" = sb."locationType"
               AND b."locationId" = sb."locationId"
               AND b.quantity > 0
           ), 0) AS batch_qty
    FROM "StockBalance" sb
    JOIN "Product" p ON p.id = sb."productId"
    WHERE p."companyId" = ${companyId}
      AND sb.quantity > 0
      AND COALESCE((
        SELECT SUM(b.quantity) FROM "Batch" b
        WHERE b."productId" = sb."productId"
          AND b."locationType" = sb."locationType"
          AND b."locationId" = sb."locationId"
          AND b.quantity > 0
      ), 0) < sb.quantity
    LIMIT 20
  `;
}

/** Inject desync for forensic test only — StockBalance inflated, batches unchanged. */
export async function injectStockBatchDesync(params: {
  productId: string;
  locationType: LocationType;
  locationId: string;
  fakeStockQty: number;
}) {
  await prisma.stockBalance.upsert({
    where: {
      productId_locationType_locationId: {
        productId: params.productId,
        locationType: params.locationType,
        locationId: params.locationId,
      },
    },
    create: {
      productId: params.productId,
      locationType: params.locationType,
      locationId: params.locationId,
      quantity: params.fakeStockQty,
    },
    update: { quantity: params.fakeStockQty },
  });
}

export async function disconnectIntegrity() {
  await prisma.$disconnect();
}
