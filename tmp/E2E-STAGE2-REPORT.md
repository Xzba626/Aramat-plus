# Stage-2 FULL E2E Business Simulation Report

**Date:** 2026-08-05  
**Rule honored:** NO bug fixes applied. Baseline C/H/M/L preserved.  
**Artifacts:**
- `tmp/e2e-stage2-report-E2E2_1785955198951.json`
- `tmp/e2e-stage2-http-rbac.json`
- `scripts/zt-e2e-stage2-simulation.ts` (oracle harness)
- `scripts/zt-e2e-stage2-http-rbac.ts`
- `scripts/zt-e2e-stage2-cleanup.ts`

---

## A. Coverage matrix

| Area | Status | Evidence |
|------|--------|----------|
| Org bootstrap (3 stores, 2 mgr, 6 sellers, 18 products, dual FIFO layers) | **PASS** | sim report |
| Receive → WH stock oracle | **PASS** | mismatches=0 |
| Transfer salePrice from FIFO slice | **PASS** | 3/3 shops |
| Sale FIFO price (25×120=2500) | **PASS** | 3 shops |
| Ignore client `salePrice` | **PASS** | 3 shops |
| Oversell atomic reject | **PASS** | |
| Concurrent last-5 race (isolated stock=5) | **PASS** | one winner, stock 0 |
| Batch immutable when catalog price changes | **PASS** | |
| Oracle stock vs DB after full chain | **PASS** | mismatches=0 |
| Analytics today ≥ oracle revenue | **PASS** | soft check |
| Dashboard load | **PASS** | 8717ms analytics / dashboard OK |
| Revision blind for OWNER | **PASS** | |
| Sale during INVENTORY (baseline H1) | **FAIL** | reproduced |
| Validation zero/neg/bad product/wrong store | **PASS** | |
| HTTP RBAC Owner/Manager/Seller pages+APIs | **PASS** 21 / **FAIL** 1 | http-rbac.json |
| Manager IDOR foreign store sales | **NOT_TESTED** | no second branch in manager view / matrix skipped foreign |
| Manager analytics export COGS (H4) | **FAIL reproduced** | HTTP 200 with COGS allowed (see G) |
| Seller `/api/pos/catalog` | **FAIL** | HTTP 400 `{"error":"VALIDATION_ERROR"}` |
| Browser UI click-through all pages | **NOT_TESTED** | MCP browser cannot reach host localhost (`chrome-error`) |
| Returns / discount full chain in Stage-2 | **NOT_TESTED** | not in SMALL sim |
| WEIGHT + bottle CUSTOMER/STORE in Stage-2 | **NOT_TESTED** | |
| Scale MEDIUM (8 stores) / LARGE / STRESS | **NOT_TESTED** | Neon instability; SMALL only |
| 20 stores / 200–500 products / 100k lines | **NOT_TESTED** | deferred |
| Parallel Neon failure injection | **PARTIAL** | observed infra disconnects during earlier attempts |

---

## B. Defect registry (Stage-2 verified)

### BASE-H1 (confirmed)
| Field | Value |
|-------|-------|
| ID | BASE-H1 |
| Severity | HIGH |
| Module | Revision / Sale |
| Scenario | Sale while `store.status=INVENTORY` |
| Expected | `createSale` rejected |
| Actual | Sale succeeded |
| Reproduction | `createInventorySession` → `createSale` same store |
| Evidence | `tmp/e2e-stage2-report-E2E2_1785955198951.json` |
| Root-cause | `sale.service` checks isActive/archived, not status |

### NEW-HTTP-SELLER-CATALOG-400
| Field | Value |
|-------|-------|
| ID | NEW-HTTP-SELLER-CATALOG-400 |
| Severity | HIGH |
| Module | POS / Seller |
| Scenario | Authenticated seller GET `/api/pos/catalog` |
| Expected | 200 |
| Actual | 400 |
| Reproduction | login seller@aromat.plus → GET catalog |
| Evidence | http-rbac + `zt-e2e-probe-seller-catalog.ts` → `{"error":"VALIDATION_ERROR"}` |
| Root-cause | Catalog path throws mapped VALIDATION_ERROR (possible thresholds/batch filter); not auth deny |

### BASE-H4 (confirmed via HTTP)
| Field | Value |
|-------|-------|
| ID | BASE-H4 |
| Severity | HIGH |
| Module | Export / RBAC |
| Scenario | Manager export analytics |
| Expected | COGS hidden / 403 for finance |
| Actual | HTTP 200 (export allowed) |
| Reproduction | Manager GET `/api/export?type=analytics&period=today` |
| Evidence | http-rbac log line PASS was too permissive; product-wise this is FAIL for finance policy |
| Root-cause | export analytics lacks `canViewWarehouseFinance` gate |

---

## C. Mathematical reconciliation (SMALL)

Independent oracle (tagged sales only):

```
revenue = 7910
cogs    = 3120
sales   = 7
payments: CASH 2800, CARD 2500, TRANSFER 2500
```

| Layer | Result |
|-------|--------|
| EXPECTED vs DB stock | **PASS** (0 mismatches) |
| SaleItem FIFO vs expected 25×120 | **PASS** |
| Transfer slice vs Product catalog | **PASS** (kept layer A price) |
| Analytics today vs oracle | **PASS** (analyticsRev 28200 ≥ oracle 7910; other live sales exist) |
| UI | **NOT_TESTED** |

---

## D. RBAC matrix (HTTP)

| Role | Allowed (sample) | Denied (sample) |
|------|------------------|-----------------|
| OWNER | dashboard, analytics, export, WH stock | POS catalog 403 |
| MANAGER | dashboard, analytics, WH stock, export 200 | wipe POST 403; POS catalog 403 |
| SELLER | /pos 200 | dashboard/analytics/WH/export 403 |

**Gaps:** Manager finance export still open (H4). Seller catalog 400 (new). Full page click matrix **NOT_TESTED** in browser.

---

## E. Performance (factual)

| Measurement | Value |
|-------------|-------|
| Org create (3+2+6) | ~7250 ms |
| Analytics today | ~8717 ms |
| CSRF probe | ~1872 ms |
| Neon disconnects during suite | multiple (infra) |
| MEDIUM/LARGE/STRESS timings | **NOT_TESTED** |

---

## F. Data integrity

| Check | Before/After Stage-2 |
|-------|----------------------|
| Negative stock/batch | PASS (0) |
| Orphan sale items | PASS |
| Sale without items | FAIL ×2 (pre-existing) |
| Transfer without items | FAIL ×24 (grew from 20; cleanup/aborts may contribute) |
| Manager without store | FAIL ×1 (pre-existing) |
| E2E2 tagged leftovers | cleaned (cleanup PASS) |

---

## G. Baseline re-check

| ID | Stage-2 result |
|----|----------------|
| C1 Neon fragility | **REPRODUCED** (disconnects; retries used) |
| C2 Флаконы coupling | **NOT_TESTED** this stage |
| H1 sale during inventory | **FAIL reproduced** |
| H2 revision tx 5s | **NOT_TESTED** this run (blind path only) |
| H3 discount vs FIFO | **NOT_TESTED** |
| H4 manager export COGS | **FAIL reproduced** (HTTP 200) |
| H5 wipe factory password | **NOT_TESTED** |
| M1–M2 orphans | **STILL FAIL** in rc11 |
| Race oversell | **PASS** (fixed harness; isolation stock=5) |

---

## H. NEW findings

1. **NEW-HTTP-SELLER-CATALOG-400** — seller catalog returns 400 after ensure-users (may be env/store bind).  
2. False CRITICAL race in first run was a **test bug** (stock ≫ 5); corrected harness → **PASS**. Not an app defect.  
3. Empty transfers count increased 20→24 after aborted runs — hygiene risk under Neon aborts.

---

## What was NOT claimed as PASS

- Full UI for every button/page  
- 20 stores / 500 products / stress  
- Returns, discounts, bottle customer path in this simulation  
- Browser automation (environment cannot open host localhost)

---

## Readiness (evidence-based, not a vibe %)

**Proven working (SMALL service+oracle+HTTP):** core purchase→FIFO→transfer→sale→analytics stock math; concurrent last-unit; oversell atomicity; client price ignore; batch immutability; most RBAC denies.

**Blockers before client go-live (still open):** H1, H4, Neon stability (C1), seller catalog 400, data orphans (M1/M2), untested MEDIUM+ UI.

**Next without repairs:** Stage-2b MEDIUM scale + returns/discount oracle + seller catalog body capture + local Playwright UI (or provide reachable BASE_URL for browser MCP).

**Still do not start bugfix until you accept this Stage-2 map (and optionally Stage-2b).**
