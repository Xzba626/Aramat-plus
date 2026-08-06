# ERP Production Readiness Report

**Tag:** `PRA_1786000416795`  
**Profile:** EXEC_SMALL  
**Finished:** 2026-08-06T07:45:13.870Z  
**Mode:** READ-ONLY — no application fixes in this audit  

No readiness percentage. Evidence-only matrix.

## Counts

| Result | Count |
|--------|------:|
| PASS | 32 |
| FAIL | 1 |
| NOT TESTED | 5 |

## Matrix

| MODULE | TEST | RESULT | EVIDENCE |
|--------|------|--------|----------|
| Scale | SMALL_requested_5stores_500sku_5k_sales | **NOT_TESTED** | Requested SMALL not run end-to-end; EXEC profile used. This run ~32min for 405 sales on Neon. |
| Scale | MEDIUM_20stores_5k_sku_100k_sales | **NOT_TESTED** | Not executed — Neon connection pool / wall-time risk |
| Scale | STRESS_50stores_10k_sku_1M_saleItems | **NOT_TESTED** | Not executed — requires dedicated Postgres + load lab |
| Org | bootstrap_stores_roles (n=30) | **PASS** | stores=5 managers=5 sellers=20 |
| Org | bootstrap_ms | **PASS** | 26447ms |
| Purchase | dual_fifo_receive (n=60) | **PASS** | piece=40×400 + weight=20×1000 ml; 94651ms |
| Purchase | wh_stock_oracle_sample (n=10) | **PASS** | mismatches=0/10 |
| FIFO | batch_immutable_vs_catalog (n=2) | **PASS** | changed=0 |
| Transfer | fifo_salePrice_slice (n=1) | **PASS** | expected 40@100 got 40 |
| Transfer | all_stores_moved (n=75) | **PASS** | stores=5 sku=15 115170ms |
| Oracle | stock_after_transfer (n=30) | **PASS** | mismatches=0/30 |
| Sale | weight_5ml_customer_bottle (n=1) | **PASS** | qty=5 |
| Sale | weight_10ml_customer_bottle (n=1) | **PASS** | qty=10 |
| Sale | weight_25ml_customer_bottle (n=1) | **PASS** | qty=25 |
| Sale | weight_50ml_customer_bottle (n=1) | **PASS** | qty=50 |
| FIFO | exact_150_split_19500 (n=1) | **PASS** | 120×100 150×50 rev=19500 cogs=13000 |
| Sale | volume_by_role (n=405) | **PASS** | seller=204 manager=100 owner=100 total=405 rev=66576 1568759ms |
| Sale | oversell_rejected (n=1) | **PASS** | threw=true avail=0 |
| Concurrency | race_8_on_stock_5 (n=8) | **PASS** | ok=5 fail=3 stock=0 |
| Return | partial_approve (n=1) | **PASS** | return approved |
| Expense | create_once (n=1) | **PASS** | amount=500 |
| Revision | H1_block_sale_during_inventory (n=1) | **PASS** | STORE_INVENTORY_IN_PROGRESS |
| Analytics | sale_header_equals_saleItems (n=411) | **PASS** | headers=66826 saleItems=66826 |
| Analytics | in_memory_oracle_vs_saleItems | **FAIL** | oracle=66576 saleItems=66826 Δ=250 (=5 race winners ×50 not booked in harness oracle). DB consistent (headers=items). |
| Analytics | company_dashboard_equals_tagged_exact | **NOT_TESTED** | Shared company day mixes live sales |
| Oracle | stock_final_sample (n=50) | **PASS** | mismatches=0/50 |
| DataIntegrity | empty_sale_headers (n=0) | **PASS** | count=0 |
| DataIntegrity | empty_transfer_headers (n=0) | **PASS** | count=0 |
| DataIntegrity | negative_stock (n=0) | **PASS** | count=0 |
| RBAC | seller_dashboard_forbidden (n=1) | **PASS** | status=403 |
| RBAC | seller_warehouse_forbidden (n=1) | **PASS** | status=403 |
| RBAC | manager_no_cogs_in_dashboard (n=1) | **PASS** | status=200 leak=false |
| RBAC | manager_idor_foreign_store (n=1) | **PASS** | status=403 |
| RBAC | owner_sees_cogs (n=1) | **PASS** | status=200 hasCogs=true |
| RBAC | manager_wipe_forbidden (n=1) | **PASS** | status=403 |
| Frontend | browser_full_screen_walk | **NOT_TESTED** | Browser MCP cannot reach host localhost; no Playwright suite |
| Cleanup | tagged_data_removed | **PASS** | PRA artifacts purged |

## Tagged numbers (this run)

```
revenue_saleItems_db = 66826
headers_sum          = 66826
in_memory_oracle     = 66576  (missing race 5×50)
sales_by_role        = seller 204 / manager 100 / owner 100
stock_oracle_sample  = 0 mismatches / 50
```

## Scale honesty

- **Executed:** EXEC_SMALL — 5 stores · 60 SKU · 405 sales · FIFO exact 19500 · RBAC post-H4.
- **Requested** 500 SKU / 5k sales, MEDIUM, STRESS — **NOT TESTED** (Neon wall/pool). Neon disconnect mid-sales recovered via retry.

## Failures

- **Analytics · in_memory_oracle_vs_saleItems:** harness bookkeeping gap on race winners — **not** an ERP ledger bug (`Sale.total` = Σ `SaleItem`).

*End of production readiness report.*
