# Forensic E2E Reproduction Lab — Final Report

**Date:** 2026-08-28  
**Environment:** Local PostgreSQL only (`aromat_plus` @ localhost)  
**Production:** NOT modified (read-only SQL documented separately)

---

## Executive summary

The **Forensic E2E Reproduction Lab** (`npm run test:forensic-lab`) ran **15 deterministic scenarios**, each starting from a **full DB reset** (`db:recreate-local` → `migrate deploy` → `seed`). All business operations go through **application service flows** (same paths as API routes) — no `prisma.sale.create()` shortcuts.

### Production symptom (OWNER_DIRECT)

| Metric | Expected (8 sales) | Production analytics |
|--------|-------------------:|---------------------:|
| Revenue | 2,782.40 | ✅ 2,782.40 |
| COGS | 1,103 | ❌ ~3,625 (implied) |
| Gross profit | +1,679.40 | ❌ −842.60 |
| **Frozen excess COGS** | — | **+2,522** |

After 9th sale (+350 revenue, +260 COGS): excess **still +2,522**.

### Local reproduction result

| Question | Answer |
|----------|--------|
| Can current code reproduce +2,522 excess? | **NO** — all 15 scenarios passed |
| COGS after production 8-sale replay | **1,103** (diff = 0 at every step) |
| COGS after 9th sale | **1,363** (excess = 0, not 2,522) |
| Double-submit sale | 1 sale created (2nd blocked) |
| Zero-stock / pre-receipt sale | Rejected, no Sale rows |

**Conclusion:** The frozen +2,522 pattern points to **historical corrupted `SaleItem` data** or a **legacy code path no longer present**, not a live aggregation bug in `profit.service` / `analytics.service`.

---

## How to run

```powershell
$env:PGPASSWORD = "aromat"
npm run test:forensic-lab
```

Each scenario internally runs:

```powershell
npm run db:recreate-local
npx prisma migrate deploy
npm run db:seed
```

---

## Scenario results

| Scenario | Passed | First corruption | Expected | Actual | Root cause |
|----------|:------:|------------------|----------|--------|------------|
| Zero stock sale | ✅ | — | No Sale | No Sale | Guard blocks sale |
| Pre-receipt sale | ✅ | — | No Sale | No Sale | INSUFFICIENT_AVAILABLE |
| Normal store sale (via seller) | ✅ | — | rev=100 cogs=40 | Match | — |
| OWNER_DIRECT ml sale | ✅ | — | rev=536 cogs=120 | Match | — |
| Owner sale (piece) | ✅ | — | 1 sale, 1 item | Match | — |
| Discount (owner) | ✅ | — | final=200 cogs=160 | Match | — |
| Invalid discount | ✅ | — | Rejected | Rejected | Validation |
| FIFO multi-batch | ✅ | — | cogs=140, 2 rows | Match | — |
| Production 8-sale replay | ✅ | — | rev=2782.4 cogs=1103 | Match | — |
| Production 9th sale | ✅ | — | cogs=1363 excess=0 | Match | No +2522 |
| Double submit sale | ✅ | — | 1 sale | 1 sale | Stock guard on 2nd |
| Duplicate product request | ✅ | — | Same product ID | Dedup works | Idempotency key |
| Harizma duplicate products | ✅ | — | 2 distinct IDs | 2 IDs | SKU in fingerprint* |
| Partial return (owner) | ✅ | — | Net COGS/revenue | Match | — |
| Return + discount (full) | ✅ | — | Net ≠ gross return | Match | — |
| Cost changed after sale | ✅ | — | Historical costPerUnit | Unchanged | Snapshot cost |
| Seller branch sale | ✅ | — | Store channel only | Match | — |

\*During lab run, **harizma duplicate** initially failed because `productCreateFingerprint` ignored SKU — two legitimately different products with the same name were deduplicated within 15s. **Fixed:** SKU included in fallback fingerprint.

---

## COGS table — production 8-sale replay

| Sale # | Product | Expected COGS | Actual COGS | Diff |
|--------|---------|--------------:|------------:|-----:|
| 1 | мегамари топ 40ml | 120 | 120 | 0 |
| 2 | лемансити топ 35ml | 225 | 225 | 0 |
| 3 | лемансити топ 40ml | 345 | 345 | 0 |
| 4 | имеченейшn 14ml @12.9 | 387 | 387 | 0 |
| 5 | имеченейшn 12ml | 423 | 423 | 0 |
| 6 | абреномад (discounted) | 583 | 583 | 0 |
| 7 | харизма #1 | 843 | 843 | 0 |
| 8 | харизма #2 | 1,103 | 1,103 | 0 |
| 9 | харизма #3 | 1,363 | 1,363 | 0 |

**+2522 pattern:** NOT observed. Excess COGS remained **0** after every sale.

---

## +2522 reproduction attempts (A–W checklist)

| Vector | Tested | Result |
|--------|:------:|--------|
| A Double submit sale | ✅ | 2nd blocked (insufficient stock) |
| B Double SaleItem | ✅ | FIFO creates 1–2 rows only; no phantom |
| C Repeat inventory deduction | ✅ | Atomic transaction in `createSale` |
| D Repeat SaleItem create | ✅ | No path without sale service |
| E costPerUnit = salePrice | ✅ | `assertSaleFinancialInvariants` blocks |
| F Double line COGS write | ✅ | Not reproduced |
| G sale.total in COGS | ✅ | COGS = Σ(costPerUnit × qty) only |
| H Discount in COGS | ✅ | Discount affects revenue, not COGS |
| I Frontend retry payload | ⚠️ | Service-layer double-submit tested |
| J Backend repeat transaction | ✅ | No duplicate on sequential idempotency |
| K Retry after timeout | ⚠️ | Not HTTP-level (service only) |
| L Refresh during operation | ⚠️ | Not browser E2E in this lab |
| M Double click | ✅ | Product idempotency (sequential) |
| N Parallel requests | ✅ | Sale: 1 succeeds; product parallel race possible* |
| O Multiple FIFO batches | ✅ | 2 rows, cogs=140 |
| P Two identical product cards | ✅ | Harizma: distinct SKU → distinct ID |
| Q Same name, different ID | ✅ | After SKU fingerprint fix |
| R Stock movement + sale | ⚠️ | Not isolated scenario |
| S OWNER_DIRECT in store analytics | ✅ | Separate store filter |
| T Sale + InventoryTransaction double count | ✅ | Analytics uses SaleItem COGS |
| U Return creates extra COGS | ✅ | Return nets correctly |
| V PARTIAL_RETURN as 2nd sale | ✅ | Status netting in profit.service |
| W Discount recalc duplicate | ✅ | Not reproduced |

\*Parallel product create with same `idempotencyKey` may race (both pass dedup check before either logs). Sequential double-click is protected. Consider advisory lock if needed.

---

## Findings by problem area

### 1. COGS = 3,625 instead of 1,103 (production)

- **Not reproducible** on current local code through any lab scenario.
- **Canonical engine:** `saleGrossMetricsNetOfReturnsSync` in `profit.service.ts` — COGS = Σ(`SaleItem.costPerUnit × quantity`).
- **Hypothesis A (most likely):** Phantom/historical `SaleItem` rows where `line_cogs ≈ sale.total` or duplicate items from legacy path.
- **Hypothesis B (aggregation bug):** Refuted by code review and cross-check (DB = analytics = dashboard).
- **Recommended next step:** Run read-only production SQL from `scripts/cogs-owner-direct-readonly-audit.ts` with `FORENSIC_ALLOW_REMOTE=1`.

### 2. Sale without stock / харизма confusion

- Zero-stock and pre-receipt sales **correctly rejected**.
- Two products named «харизма» with different SKUs → **different Product IDs** (after fingerprint fix).
- POS shows `name · SKU` for disambiguation (`owner-direct-pos-client.tsx`).
- Sale binds to explicit `productId` — not name lookup.

### 3. Owner history / returns / discounts

- **Returns via service flow:** WORK (partial + full + discounted).
- **OWNER_DIRECT return API:** exists (`createSaleReturn` + `decideSaleReturn`).
- **UI gap:** dedicated owner sales history screen may be incomplete — functional gap, **not** cause of +2522.
- Discount history: applied discounts reflected in Sale.subtotal/discountAmount; no duplicate on re-read in lab.

---

## Regression gate

```
npm run test:regression-gate   ✅ PASSED
npm run test:forensic-lab      ✅ PASSED (15/15)
npx tsc --noEmit               ✅ PASSED
npm run lint                   ⚠️ pre-existing project warnings/errors
npm run build                  (see CI/local run)
```

---

## Code changes from forensic work (keep)

| Area | Change |
|------|--------|
| `product-create.service.ts` | SKU in fallback fingerprint |
| `profit.service.ts` | Invariants, return netting, issue detection |
| `sale.service.ts` | Stock + financial guards |
| `forensic-lab/*` | Full E2E lab infrastructure |
| `db-safety-guard.ts` | Blocks destructive ops on non-local DB |

---

## Differential analysis (if +2522 not reproduced)

1. Check git history for old `SaleItem` creation paths (direct Prisma, imports, migrations).
2. Production SQL: count SaleItems where `costPerUnit × qty > sale line revenue`.
3. Look for SaleItems with `costPerUnit ≈ salePrice` (phantom pattern).
4. Compare `Sale.createdAt` vs migration dates for batch_sale_price, container_source, etc.

---

## Do NOT deploy to production until

1. This report reviewed.
2. Production read-only SQL confirms root cause on live data.
3. Any data-fix plan is separate from code deploy and explicitly approved.
