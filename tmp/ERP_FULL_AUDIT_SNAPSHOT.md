# ERP Full Acceptance & Stress Audit — Snapshot

**Tag:** `AUDIT_1785996633762`  
**Mode:** READ-ONLY (no app code changes; no Phase 3.1)  
**Finished:** 2026-08-06T06:12:23.869Z  
**Roles used:** temporary `audit.owner@test.com` / `audit.manager@test.com` / `audit.seller@test.com` (passwords not stored in this report)

**Question answered:** *If we give this ERP to a business with ~20 branches tomorrow — where does it break?*

---

## Counts (evidence only — no readiness %)

| Status | Count |
|--------|------:|
| PASS | 22 |
| FAIL | 5 |
| PARTIAL | 1 |
| NOT TESTED | 3 |
| RISK | 2 |

---

## A. PASS

- `accounts.audit_temp`: audit.owner/manager/seller@test.com upserted (temp password in local script only)
- `db.negative_stock`: count=0
- `db.batch_null_salePrice`: count=0
- `db.sellers_without_store`: count=0
- `fifo.transfer_preserves_layers`: store layers 120=100 150=100
- `fifo.sale_150_split`: SaleItem 120×100 + 150×50; rev=19500 cogs=13000 (expect 19500/13000)
- `fifo.ignores_product_catalog_price`: catalog decoy 999 used=false
- `fifo.stock_after_sale`: remain=50 expect 50
- `reconcile.sale_header_vs_items`: Sale.total=19500 itemsSum=19500
- `race.10_sellers_qty10_on_50`: ok=5 fail=5 stock=0
- `expense.create_once`: id=cmsh4bf9j003humtkkq6yvygh type=Аренда
- `http.login_audit_accounts`: all three roles logged in
- `http.owner.dashboard`: GET /api/dashboard → 200 expected 200
- `http.manager.dashboard_cogs_leak`: GET /api/dashboard → 200 expected 200
- `http.seller.dashboard`: GET /api/dashboard → 403 expected 401|403
- `http.seller.warehouse`: GET /api/warehouse/stock → 403 expected 401|403
- `http.seller.pos_catalog`: GET /api/pos/catalog → 200 expected 200
- `http.seller.export_analytics`: GET /api/export?type=analytics&period=today → 403 expected 401|403
- `http.manager.wipe`: POST /api/settings/wipe → 403 expected 401|403|405
- `http.manager.idor_foreign_sales`: GET /api/stores/cmsg3lzr80001um10tcf3y73z/sales → 403
- `scale.prior_acceptance_small`: Prior ACCEPT_1785994337308: 5 stores, 100 SKU, 210 sales, oracle stock 0 mismatches — see SYSTEM_ACCEPTANCE_REPORT.md
- `cleanup.probe_data`: tagged products/sales removed; audit users kept

---

## B. FAIL

- `db.empty_sale_headers`: count=2
- `db.empty_transfer_headers`: count=24
- `revision.H1_sale_during_inventory`: sale allowed
- `http.manager.export_analytics_H4`: GET /api/export?type=analytics&period=today → 200 expected 403
- `http.manager.dashboard_exposes_finance_keys`: cogs=18010 gross=9040 net=9040

### Defect registry

#### DATA-EMPTY-SALES [MEDIUM]
- **Module:** DataIntegrity
- **Scenario:** Sale without items
- **Expected:** 0
- **Actual:** 2
- **Reproduction:** prisma.sale.count items none
- **Evidence:** AUDIT_1785996633762


#### DATA-EMPTY-TRANSFERS [MEDIUM]
- **Module:** DataIntegrity
- **Scenario:** Transfer without items
- **Expected:** 0
- **Actual:** 24
- **Reproduction:** prisma.transfer.count items none
- **Evidence:** AUDIT_1785996633762


#### H1-SALE-DURING-INVENTORY [HIGH]
- **Module:** Revision/Sale
- **Scenario:** Sale while INVENTORY
- **Expected:** reject
- **Actual:** sale succeeded
- **Reproduction:** createInventorySession → createSale
- **Evidence:** cmsh4b8sb002fumtkd89zo168
- **Root-cause hint:** sale.service checks active/archived, not store.status

#### H4-MANAGER-EXPORT-COGS [HIGH]
- **Module:** Security/Export
- **Scenario:** Manager analytics export
- **Expected:** 403
- **Actual:** 200
- **Reproduction:** audit.manager@test.com GET /api/export?type=analytics
- **Evidence:** http://127.0.0.1:3000
- **Root-cause hint:** export route type=analytics never calls canViewWarehouseFinance

#### H4b-MANAGER-DASHBOARD-COGS [HIGH]
- **Module:** Security/Dashboard
- **Scenario:** Manager dashboard JSON includes COGS/profit
- **Expected:** no cost/profit fields for MANAGER
- **Actual:** cogs=18010
- **Reproduction:** audit.manager GET /api/dashboard
- **Evidence:** AUDIT_1785996633762
- **Root-cause hint:** dashboard route does not strip finance for MANAGER

---

## C. PARTIAL

- `http.seller.pos_catalog_stability`: This run + prior acceptance HTTP: 200; Stage-2 (2026-08-05): 400 VALIDATION_ERROR — data/env sensitive

---

## D. NOT TESTED

- `reconcile.dashboard_analytics_export_exact_tagged`: Company-wide today mixes other live sales; isolated company not provisioned. Exact SaleItem math proven above (19500).
- `scale.medium_20_stores_50k_sales`: Not executed this pass (Neon wall time; prior SMALL ~18min for 210 sales)
- `frontend.browser_all_screens`: Browser MCP cannot reach host localhost; no Playwright gate

---

## E. RISK (architectural / latent)

- **arch.expense_name_coupling:** Packaging analytics coupled to literal expense type name "Флаконы" — _src/lib/services/expense.service.ts_
- **arch.dashboard_mgr_sees_cogs_fields:** Dashboard API returns cogs/profit to MANAGER (scoped store) with no finance strip — _src/app/api/dashboard/route.ts + dashboard.service.ts_
- **arch.export_analytics_no_finance_gate:** `type=analytics` always writes COGS/gross/net; `canViewWarehouseFinance` only gates `type=products` — proven by H4 FAIL — _src/app/api/export/route.ts_
- **infra.prisma_pool_under_concurrency:** During 10-way race, Prisma P2024 pool timeout on low-stock notify path (limit=5); sales still correct but Neon/pool risk under parallel POS — _race log_
- **arch.export_analytics_no_finance_gate:** `type=analytics` always writes COGS/gross/net; `canViewWarehouseFinance` only gates `type=products` — _src/app/api/export/route.ts_ (proven as H4 FAIL)
- **infra.prisma_pool_under_concurrency:** During 10-parallel sales, low-stock notify hit `P2024` connection pool timeout (limit 5) — sale core still atomic (stock=0), but notifications/side-effects flake under concurrency

---

## Exact FIFO proof (this run)

Expected after sell 150 from layers 100@120 + 100@150:

```
SaleItem: 100 × 120 + 50 × 150
Revenue: 19500
COGS:    13000
```

Actual: 120×100 + 150×50; rev=19500; cogs=13000

---

## Where it breaks at ~20 branches (auditor view)

1. **During inventory** — sales still go through (**H1**). Stock/revision truth collapses under real ops.
2. **Manager finance** — analytics export + dashboard expose COGS/profit (**H4 / H4b**). Role boundary fails for owner-private numbers.
3. **Empty Sale/Transfer headers** in live DB — history/export noise; possible abort paths without cleanup.
4. **Expense type name coupling** (`"Флаконы"`) — rename type → packaging P&L silently wrong.
5. **Scale unproven** — MEDIUM 20×500×50k **NOT TESTED**; SMALL alone ~18 min wall on Neon for 210 sales.
6. **UI unproven** — full screen walk **NOT TESTED** (no browser reach / no Playwright).
7. **Exact multi-layer reconcile Dashboard=Analytics=Export** for tagged-only universe **NOT TESTED** (shared company day).

What already holds under load of a small chain: dual-FIFO `Batch.salePrice`, transfer layer copy, oversell atomicity, concurrent last-stock races (no negative stock in probes), Seller blocked from Owner warehouse/dashboard APIs, Manager IDOR on foreign store sales (sample).

---

## D. Recommendations

### До запуска клиентам (must)

1. Fix **H1** — block sales (and stock mutations) while `store.status=INVENTORY`; re-prove.
2. Fix **H4 + H4b** — gate Manager analytics export; strip COGS/profit from Manager dashboard API (or 403 finance fields).
3. Explain/clean **empty Sale/Transfer** headers; add guard so headers cannot commit empty.
4. Re-prove FIFO exact + race + IDOR after fixes.

### Можно позже

1. MEDIUM stress (20 stores / 50k sales) on pooled DB.
2. Playwright UI acceptance all roles.
3. Isolated demo company for exact Dashboard=Analytics=Export equality.
4. Decouple packaging expense from literal `"Флаконы"`.
5. Discount vs FIFO estimate edge proof.

### Не трогать (сейчас)

1. Phase 3.1 product work (payment analytics / container UX polish) until H1/H4 closed.
2. Cosmetic redesign / unrelated refactors.
3. Do not expand scope into new features before this snapshot’s FAIL list is green.

---

## Prior evidence merged

- `tmp/SYSTEM_ACCEPTANCE_REPORT.md` (ACCEPT SMALL + HTTP)
- `tmp/E2E-STAGE2-REPORT.md`

---

*End of snapshot. Application code was not modified for fixes.*
