# Forensic audit: «харизма» / личные продажи владельца

**Status:** local forensic suite ready; production data **not touched**.  
**Architecture:** WAREHOUSE → direct sale — **not changed** (no virtual store refactor).

---

## A. Root cause (working hypothesis — requires production SQL to confirm)

```
Root cause (hypothesis):
  Two Product records named «харизма» (duplicate create ~1s apart)
  + sale on Product ID without matching Batch/receipt on that same ID
  → journal shows «sale before receipt» and duplicate POS cards
  → analytics COGS may diverge if SaleItem rows are corrupted (separate track)
```

**Not proven without production:**

```text
Product A id → Batch? → Sale 26.08? → COGS?
Product B id → Batch? → Sale 27–28.08? → COGS?
```

Read-only SQL (production):

```sql
SELECT id, sku, name, "createdAt" FROM "Product" WHERE name ILIKE '%харизма%';
SELECT s.id, s."createdAt", si."productId", p.sku, si.quantity, si."costPerUnit"
FROM "Sale" s JOIN "SaleItem" si ON si."saleId" = s.id JOIN "Product" p ON p.id = si."productId"
WHERE p.name ILIKE '%харизма%' ORDER BY s."createdAt";
SELECT b."productId", p.sku, b."initialQuantity", b.quantity, b."costPerUnit", b."receivedAt"
FROM "Batch" b JOIN "Product" p ON p.id = b."productId" WHERE p.name ILIKE '%харизма%';
```

---

## B. User action vs system defect

| Observation | User | System |
|---|---|---|
| Two «Товар создан — харизма» 1s apart | Possible double-click / double submit | **No idempotency** on `POST /api/products` (before fix) |
| Sale before warehouse receipt in journal | May have picked wrong duplicate card | **Must block** sale when `Batch` qty = 0 |
| Three sales, one receipt | Confusing if spread across 2 Product IDs | UI showed same name twice |
| Gross profit −842 | — | Separate analytics track (SaleItem COGS); see analytics audit |

**Conclusion:** Likely **combination** — user double-create + system allowed duplicate IDs + UI indistinguishable names. Not proven that **architecture** of owner-direct sale is wrong.

---

## C. Checklist (code + local replay)

```text
[x] duplicate Product ID possible (Scenario B/C/F)
[x] sale before receipt blocked on current code (Scenario D/F pre-receipt)
[ ] wrong Product ID on historical sale — needs production SQL
[ ] missing batch on sold product — needs production SQL
[ ] FIFO bug — not seen in local A/E/F
[ ] owner direct branch uses same createSale + warehouse location (code review)
[ ] analytics COGS bug — separate; phantom SaleItem hypothesis
[ ] legacy data inconsistency — possible on production only
[x] user sequence (create×2 → sell → receive) reproducible (Scenario F)
```

---

## D. What to change (only after local forensic pass)

### Must fix (minimal, not architectural)

1. Product create idempotency (double submit) — **implemented, uncommitted**
2. `assertBatchStockCoversSale` before FIFO deduct — **implemented, uncommitted**
3. POS disambiguation `name · SKU` when duplicates — **implemented, uncommitted**

### Improve (after forensic)

4. Owner direct **return UI** (API exists; restores WAREHOUSE — Scenario H)
5. Auto-approve return for owner on OWNER_DIRECT channel (optional UX)
6. Sale detail view linking Product ID / SKU in owner POS history

### Do not touch

- Branch store transfer → sale pipeline
- Virtual owner store architecture
- Production data merge/delete

---

## E. Local setup

1. Create DB: `createdb aramatplus_forensic` (or pgAdmin)
2. Copy `.env.forensic.example` → `.env` (already gitignored)
3. `npx prisma migrate deploy`
4. `npx tsx prisma/seed.ts`
5. `npm run test:owner-sales-forensic`

Guard: refuses non-localhost `DATABASE_URL` unless `FORENSIC_ALLOW_REMOTE=1`.

**Current blocker:** local `.env` credentials invalid (`aromat` auth failed). Fix PostgreSQL user/password before running suite.

---

## F. Canonical source of truth (code review)

| Layer | Source |
|---|---|
| Revenue, COGS, gross | `Sale` + `SaleItem` frozen fields → `profit.service.ts` |
| Owner POS history | `GET /api/sales?storeId=` → `Sale` table (not separate session store) |
| Action log | `ActivityLog` — audit only, not financial SSOT |
| Store business history | `getStoreSalesHistory` → `Sale` + items |

---

## G. Return path (owner direct)

```
createSaleReturn → PENDING
decideSaleReturn APPROVE → addBatch(WAREHOUSE) + sale status RETURNED/PARTIAL_RETURN
```

Same service as branch stores; stock returns to **central warehouse**, not virtual store.  
Gap: no dedicated return button in owner POS UI; owner uses `/returns` approve flow.

---

## H. Order of work (agreed)

1. ✅ Forensic test suite + env guard + this report  
2. ⏳ Fix local PostgreSQL → run `npm run test:owner-sales-forensic`  
3. ⏳ Production read-only SQL → confirm Product A/B mapping  
4. ⏳ Minimal fixes commit (only proven items)  
5. ⏳ Regression + deployment discussion — **no production data migration without approval**
