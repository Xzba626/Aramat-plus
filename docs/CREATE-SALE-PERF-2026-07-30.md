# createSale performance — 2026-07-30

## Symptom
`test:stock-flow` failed with Prisma interactive transaction timeout **5s** on `sale.create`. Timeout was temporarily raised to 20s as a safety net.

Target for POS: **&lt; 500ms warm**, acceptable **&lt; 2s** (Neon cold start may be higher).

## Root causes (not “too much business logic”)

Inside one interactive TX the old path did:

| Step | Problem |
|------|---------|
| Per line `product.findFirst` | N+1 reads in TX |
| Per batch `batch.update` | N round-trips for FIFO |
| `upsertStockBalance` = find + update | +2 RTTs per line |
| Nested `items.create` + heavy `include` | Extra work before commit |
| `logActivity` inside TX | Audit blocked stock commit |

No dashboard recalculation inside `createSale` — that was a false suspicion. Analytics are read models from `Sale`/`SaleItem`.

## Fixes

1. **Preload** store, seller, products **outside** TX (`Promise.all` + one `product.findMany`).
2. TX only: FIFO deduct + `Sale` + `saleItem.createMany`.
3. **FIFO**: one `UPDATE` for all touched batches (`CASE id …`); atomic `StockBalance` decrement with `quantity >= need`.
4. **Audit + rich include** after commit.
5. TX timeout safety net **10s** (not 20s); warm path should not need it.

## Measured (this environment → Neon)

| Run | createSale #1 | createSale #2 (warm) |
|-----|---------------|----------------------|
| After RTT cuts | ~4.5–5s | ~4.5s |

Conclusion: wall time is dominated by **network RTT to Neon** (~0.7–1s per query round-trip × ~4–5 trips), not by missing indexes or dashboard recalculation.

Logic cost of FIFO+Sale itself is small; co-locate app with DB (Vercel region ≈ Neon region) for POS &lt;500ms in production.
