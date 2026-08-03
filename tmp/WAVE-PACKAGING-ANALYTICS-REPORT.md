# Packaging-as-product leak + ZT artifacts

## Architecture (current)

Bottles are **not** a separate physical table for stock: `PackagingSku` exists, and each bottle SKU also has a `Product` row with `kind = PACKAGING` for FIFO stock. Merchandise uses `kind = STANDARD`.

Near-term rule: every merchandise/analytics/report query must use `kind: STANDARD` (helper: `src/lib/product-kind.ts`). Full physical split of stock off `Product` is a larger migration and was not done in this pass.

## Root cause (finance)

`getAnalyticsBreakdown` built «Слабые / без продаж» from **all** active products → packaging bottles appeared as unsold merchandise. Categories/types only aggregate sale lines (usually STANDARD), but product rankings leaked via `neverSold`.

## Fixed sites

| Area | File | Change |
|------|------|--------|
| Finance → Товары (Топ / Слабые) | `analytics.service.ts` | Skip PACKAGING on sale lines; `neverSold` = STANDARD only |
| Dashboard top product / weight-piece / low stock / warehouse SKU | `dashboard.service.ts` | Merchandise filters |
| Export products XLSX | `api/export/route.ts` | `kind: STANDARD` |
| Warehouse stock breakdown | `warehouse.service.ts` | STANDARD balances + cost batches |
| Warehouse overview balances / skuCost | `warehouse.service.ts` | STANDARD |
| Store stock list | `stores-detail.service.ts` | STANDARD + skuCount |
| Stores list sku/units/cost | `stores-list.service.ts` | STANDARD |
| Shared helper | `product-kind.ts` | `merchandiseProductWhere` / `isMerchandiseProduct` |

## Already correct (unchanged)

- POS catalog, `/api/warehouse/stock`, `/api/products` default STANDARD, sale create rejects PACKAGING, packaging UI under Склад → Флаконы

## Intentionally includes PACKAGING

- Revision / inventory sessions (physical count of bottles)
- Packaging management APIs

## ZT test artifacts

Confirmed leftovers from Cursor proof scripts writing into the **same** DB as the owner (no separate test DB):

- Deleted: `ZT Rev 1785741946090`, `ZT Rev 1785745791801`, packaging junk `100 мл`
- Remaining active packaging: only real bottles «Флакон 5 мл · стекло», «Флакон 10 мл · стекло»
- `zt-revision-proof.ts` now cleans up its product after the run
- Tools: `scripts/zt-purge-test-artifacts.ts`, `scripts/zt-hard-delete-archived-tests.ts`

## Proof

`npx tsx scripts/zt-packaging-analytics-proof.ts` → `pass: true`, `packagingLeakedIntoRankings: []`, `ztArtifactsRemaining: []`
