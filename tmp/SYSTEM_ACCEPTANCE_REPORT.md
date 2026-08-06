# SYSTEM ACCEPTANCE REPORT

**Tag (service sim):** `ACCEPT_1785994337308`  
**Scale executed:** SMALL (5 stores · 100 SKU · ~210 sales)  
**Finished (sim):** 2026-08-06T05:49:49.269Z  
**Finished (HTTP RBAC re-run):** 2026-08-06T05:53:10.574Z  
**Mode:** READ-ONLY — no application bugfixes in this stage  

**Artifacts:**
- `tmp/acceptance-ACCEPT_1785994337308.json`
- `tmp/acceptance-run.log`
- `tmp/acceptance-http-rbac.json`
- `tmp/acceptance-http-run.log`
- Prior Stage-2: `tmp/E2E-STAGE2-REPORT.md`

---

## 1. Executive summary

Evidence-only counts for this acceptance pass (sim + HTTP merge; analytics soft-check downgraded to PARTIAL):

| Status | Count |
|--------|------:|
| **PASS** | 36 |
| **FAIL** | 2 |
| **PARTIAL** | 1 |
| **NOT TESTED** | 4 |

**Business chain verdict (what held under SMALL):**

Warehouse receive (dual FIFO) → transfer with batch `salePrice` slice → piece + weight sales → oversell reject → concurrent last-5 → expense → partial return → revision blind → oracle stock sample — **held**.

**Blocking defects proven again:**

1. **H1** — Sale succeeds while store `status=INVENTORY`
2. **H4** — Manager `GET /api/export?type=analytics` returns **200** (finance export not gated)

No readiness percentage. Production decision must use FAIL / NOT TESTED below.

---

## 2. Tested scenarios

| # | Scenario | How tested |
|---|----------|------------|
| 1 | Org bootstrap | 1 Owner + 5 stores + 3 managers + 10 sellers (`ACCEPT_*`) |
| 2 | Dual-FIFO receive | 50 PIECE + 50 WEIGHT, layers A/B salePrice |
| 3 | Batch immutability | Catalog `salePrice` change → batch layers unchanged |
| 4 | Transfers | All 5 stores × 20 SKU + weight sample; FIFO price slice |
| 5 | Sales volume | ~210 piece sales + weight 1/5/50 ml × 3 stores |
| 6 | Client price ignore | Injected `salePrice:1` → stored FIFO 100 |
| 7 | Oversell | `qty = avail+100` throws |
| 8 | Concurrent race | last-5 stock: 1 ok / 1 fail / stock=0 |
| 9 | Expense ONCE | amount=250 |
| 10 | Partial return | create + APPROVE |
| 11 | Revision blind | OWNER IN_PROGRESS blind=true |
| 12 | H1 probe | sale during INVENTORY |
| 13 | PENDING revision | system/fact visible after submit |
| 14 | Oracle stock | sample 40 keys, 0 mismatches |
| 15 | Analytics/dashboard | company-wide today (soft) |
| 16 | HTTP RBAC/IDOR | Owner/Manager/Seller APIs (separate re-run) |
| 17 | Integrity empty headers | before/after counts |

---

## 3. PASS

### Service / business (SMALL harness)

- `integrity.before` — emptySales=2 emptyTransfers=24 negBal=0
- `org.owner` / `org.create` — stores=5 managers=3 sellers=10 (6866ms)
- `catalog.receive_dual_fifo` — piece=50 weight=50 (139765ms)
- `reconcile.wh_sample10` — mismatches=0/10
- `batch.immutable_on_catalog_price` — changed=0
- `transfer.fifo_salePrice_slice` — expected 40@100 got 40
- `sale.weight_1ml` / `_5ml` / `_50ml` — 3 stores, CUSTOMER_BOTTLE
- `sale.ignore_client_price` — got=100 (not client 1)
- `sales.volume` — oracleSales=210 revenue=29662
- `sale.oversell_atomic` — threw=true
- `sale.concurrent_last5` — ok=1 fail=1 stock=0 runners=2
- `expense.create_once` — amount=250
- `return.partial_approve` — return id recorded
- `revision.blind_in_progress_owner` — blind=true
- `revision.pending_shows_system_fact_diff` — blind=false items=21
- `dashboard.load` — loaded (today figure company-wide)
- `reconcile.oracle_stock_sample` — mismatches=0/40
- `integrity.after` — emptySales=2 emptyTransfers=24 negBal=0 (unchanged by ACCEPT run)
- `cleanup` — tagged ACCEPT data removed

### HTTP RBAC (2026-08-06 re-run)

- `http.owner.dashboard_api` — 200
- `http.owner.export_analytics` — 200 (xlsx)
- `http.manager.dashboard_api` — 200
- `http.seller.dashboard_api` — 403 FORBIDDEN
- `http.seller.warehouse_stock` — 403 FORBIDDEN
- `http.seller.pos_catalog` — **200** (this run)
- `http.manager.wipe_post` — 403 FORBIDDEN
- `http.manager.idor_foreign_sales` — **403** (foreign store sales blocked)

**Note:** Stage-2 (2026-08-05) recorded Seller `/api/pos/catalog` → 400 `VALIDATION_ERROR`. This acceptance HTTP re-run got **200**. Treat as **environment/data-sensitive**; keep in watchlist until stable across clean seller stores.

---

## 4. FAIL

### FAIL-1 — Sale during inventory (H1)

```
revision.H1_sale_during_inventory: sale allowed
```

| Field | Value |
|-------|-------|
| ID | H1-SALE-DURING-INVENTORY |
| Severity | HIGH |
| Module | Revision / Sale |
| Expected | `createSale` rejected while `store.status=INVENTORY` |
| Actual | Sale succeeded |
| Reproduction | `createInventorySession` → `createSale` same store |
| Evidence | ACCEPT_1785994337308 + Stage-2 prior reproduce |
| Also seen | Stage-2 BASE-H1 |

### FAIL-2 — Manager analytics export (H4)

```
http.manager.export_analytics_H4: GET /api/export?type=analytics&period=today → 200 expected 403
```

| Field | Value |
|-------|-------|
| ID | H4-MANAGER-EXPORT-COGS |
| Severity | HIGH |
| Module | Security / Export |
| Expected | 403 (or export without COGS/finance) |
| Actual | 200 binary xlsx |
| Reproduction | login `manager@aromat.plus` → GET export analytics |
| Evidence | `tmp/acceptance-http-rbac.json` |
| Also seen | Stage-2 BASE-H4 |

### Defect registry (non-FAIL but recorded)

| ID | Severity | Scenario | Evidence |
|----|----------|----------|----------|
| DATA-EMPTY-HEADERS | MEDIUM | Pre-existing empty Sale/Transfer headers | sales=2 transfers=24 before & after ACCEPT (not introduced by this run) |

---

## 5. NOT TESTED

| ID | Reason |
|----|--------|
| `frontend.all_screens_browser` | Browser MCP cannot reach host localhost; no Playwright suite in this run |
| `scale.full_20_stores_500_sku_10k_sales` | `ACCEPT_SCALE=medium` / full MEDIUM not executed (SMALL alone ~18 min wall; Neon cold starts) |
| `discount.vs_fifo_edge` | Needs discount-request approve when FIFO subtotal &lt; estimate |
| `network.offline_mid_sale` | Needs browser/network fault injection |
| Double-submit / mid-sale browser close / delete product-user UI paths | No UI automation |
| Full API surface IDOR matrix (all route handlers) | Sampled Owner/Manager/Seller only |
| Exact chain `POS total = Sale = Dashboard = Analytics = Export` for tagged sales only | See PARTIAL |

---

## 6. Security issues

| Issue | Status |
|-------|--------|
| H4 Manager finance export | **FAIL** (proven HTTP 200) |
| Seller blocked from dashboard / WH stock | **PASS** (403) |
| Manager blocked from wipe | **PASS** (403) |
| Manager IDOR foreign store sales | **PASS** (403) this run |
| Seller POS catalog auth | **PASS** (200) this run; Stage-2 had 400 (non-auth defect risk) |
| Hidden Owner APIs as Seller | Sampled only — not exhaustive |

---

## 7. Data consistency issues

| Check | Result |
|-------|--------|
| Oracle stock vs DB (40 keys) | **PASS** mismatches=0 |
| Transfer FIFO salePrice slice | **PASS** 40@100 |
| Client salePrice injection | **PASS** ignored |
| Concurrent last-5 | **PASS** no negative stock |
| Empty Sale headers | **2** pre-existing |
| Empty Transfer headers | **24** pre-existing |
| Negative StockBalance | **0** before & after |
| Analytics today vs tagged oracle | **PARTIAL** — analytics=30247 oracle=29662 (Δ=585); check was soft `analytics ≥ oracle` company-wide, not tagged equality |

Independent tagged oracle (ACCEPT run):

```
sales   = 210
revenue = 29662
payments: CASH 10152, CARD 9900, TRANSFER 9510
```

---

## 8. Performance issues

| Step | Duration |
|------|----------|
| org_create | 6.9s |
| catalog_receive (100 SKU dual batch) | **140s** |
| transfers (5 stores) | **144s** |
| sales_loop (~210) | **667s (~3.2s/sale avg wall incl. Neon)** |
| analytics_today | 4.8s |
| Full SMALL wall clock | **~18.3 min** |

Observations (evidence, not guesses):

- Neon disconnects observed in preflight (`Can't reach database server`) before successful run
- MEDIUM (20 stores / 10k sales) not run — projected wall time and connection risk too high for this pass without pooled dedicated DB

---

## 9. Recommended fixes priority (do **not** implement in this stage)

1. **H1** — block `createSale` (and related stock mutations) while store `INVENTORY`
2. **H4** — gate Manager analytics export / strip COGS/finance (`canViewWarehouseFinance` or 403)
3. Empty Sale/Transfer headers — root-cause (seed vs abort path) + guard
4. Discount vs FIFO estimate — dedicated proof (still NOT TESTED)
5. Seller POS catalog stability — re-prove on clean seller store (Stage-2 400 vs this 200)
6. Infra — Neon pooling / avoid cold disconnects under load
7. Only after above: MEDIUM scale + Playwright UI acceptance

---

## 10. Production readiness checklist

- [ ] H1 FAIL closed and re-proven
- [ ] H4 FAIL closed and re-proven
- [ ] Empty Sale/Transfer headers explained or cleaned + guarded
- [ ] Tagged exact reconcile: Sale Σ = Dashboard = Analytics = Export (day/store/all)
- [ ] Discount/FIFO edge PASS
- [ ] MEDIUM scale PASS or explicit accepted risk with evidence
- [ ] Browser UI acceptance PASS (or Playwright gate)
- [ ] Stable DB under concurrent sellers (no cold-start disconnects)

**Until H1 and H4 are closed, do not treat the system as client-ready for multi-store inventory + role-separated finance.**

---

## PARTIAL

- `analytics.today_vs_oracle_revenue` — company-wide today **≥** tagged oracle (30247 ≥ 29662). Exact equality **not** proven; other live sales exist in company.

---

## Coverage vs requested acceptance matrix

| Requested area | Outcome |
|----------------|---------|
| Org 5–20 stores / roles | SMALL: 5 stores PASS; 20 stores **NOT TESTED** |
| Owner / Manager / Seller UI full walk | **NOT TESTED** (browser) |
| Role API sample | HTTP PASS except H4 FAIL |
| 200+200 products | SMALL: 50+50 PASS; 200+200 **NOT TESTED** |
| Dual batch FIFO + immutable | **PASS** |
| Transfer all stores | SMALL **PASS** |
| Thousands of sales | 210 PASS; 1k/10k **NOT TESTED** |
| Concurrent sellers | last-5 race **PASS** (2 runners); 10 sellers same SKU **NOT TESTED** at that concurrency |
| Expenses → analytics link | expense create PASS; full P&L attribution **PARTIAL/NOT** exact |
| Revision full cycle | blind + PENDING PASS; H1 FAIL |
| Error scenarios (offline, double-click) | **NOT TESTED** |
| Load MEDIUM | **NOT TESTED** |
| Frontend audit every screen | **NOT TESTED** |
| Full API IDOR audit | Sampled only |

---

*End of SYSTEM ACCEPTANCE REPORT — repairs are a separate stage.*
