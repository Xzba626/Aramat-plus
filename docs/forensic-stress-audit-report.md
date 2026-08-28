# Forensic / Stress / E2E Audit — Full Report

**Date:** 2026-08-28  
**Scope:** Local PostgreSQL only — **production NOT modified**

---

## Commands

| Command | Purpose |
|---------|---------|
| `npm run test:forensic-stress-audit` | Full orchestrator (lab + extended + regression + optional HTTP/stress) |
| `npm run test:forensic-lab` | 15 deterministic scenarios, DB reset each |
| `npm run test:forensic-extended` | Stock/batch, concurrency, cross-layer checks |
| `FORENSIC_RUN_STRESS=1 npm run test:forensic-stress-audit` | Includes 10k stress seed + invariant scan |
| `npm run test:stress-invariant-scan` | Post-stress raw vs app financial cross-check |

---

## Layer verification model

Success requires agreement across **all** layers — not UI alone:

```text
Raw DB (independent-calculator.ts)
  ↓ compare
profit.service / saleGrossMetricsNetOfReturnsSync
  ↓ compare
analytics.service / getAnalyticsBreakdown
  ↓ compare
stores-detail.service / getStoreSalesHistory
  ↓ compare
dashboard.service (today slice)
```

Snapshots print `raw-DB`, `financials`, `analytics`, `ownerDirect` side-by-side.

---

## Results summary

### Forensic lab (15 scenarios) — **PASS**

Zero stock, pre-receipt, OWNER_DIRECT, discounts, FIFO, production 8+9 sale replay, double submit, idempotency, harizma duplicates, returns, cost snapshot, seller branch.

**Production +2522 COGS pattern:** NOT reproduced (excess = 0 after every sale).

### Extended audit (9 scenarios) — **PASS**

| Test | Result | Evidence |
|------|:------:|----------|
| StockBalance>0, Batch=0 → sale | ✅ | INSUFFICIENT_BATCH_STOCK, 0 Sales |
| Batch>0, StockBalance=0 → sale | ✅ | Rejected, 0 Sales |
| Concurrent 2× sale on 1 unit | ✅ | 1 success, 1 fail |
| Rejected return | ✅ | rev/cogs unchanged |
| Second full return | ✅ | Blocked |
| FIFO 150 @ 3+4 | ✅ | raw COGS = 500 |
| Owner expense → net profit | ✅ | gross=90, exp=50, net=40 |
| DB→app→analytics→history | ✅ | All layers match |
| DB integrity | ✅ | No orphans/negatives |

### Regression gate — **PASS**

Control case, FIFO regression, analytics audit, owner-sales forensic A–H.

---

## Production COGS anomaly

| Metric | Expected (8 sales) | Production symptom | Local replay |
|--------|-------------------:|-------------------:|:------------:|
| Revenue | 2,782.40 | ✅ | ✅ 2,782.40 |
| COGS | 1,103 | ~3,625 | ✅ 1,103 |
| Frozen excess | — | +2,522 | **0** |

**Conclusion:** Current code paths do not produce +2522. Most likely **historical SaleItem corruption** or **legacy code** no longer present.

**Next step:** Read-only SQL via `scripts/cogs-owner-direct-readonly-audit.ts` with `FORENSIC_ALLOW_REMOTE=1`.

---

## Bugs found & fixed during audit

| Issue | Root cause | Fix |
|-------|------------|-----|
| Harizma duplicate products collapsed | Fingerprint ignored SKU | SKU in `productCreateFingerprint` |
| Idempotency parallel race | Test used parallel POST | Sequential double-submit test |
| Production-8 revenue mismatch | Sale #4 unit price 12.9 not 13.4 | Test spec corrected |

---

## Known gaps (NOT blocking COGS, functional backlog)

| Requirement | Status |
|-------------|--------|
| Store detail Today/Week/Month/Year filters | ❌ Store KPIs hardcoded today/month; sales history all-time |
| Owner Personal Sales dedicated history screen | ⚠️ Data via `/api/sales?storeId=` + store detail; no full dedicated history UI |
| Owner discount history screen | ⚠️ Discount on Sale record; no separate owner discount history page |
| Owner expense history (personal sales) | ⚠️ `/api/expenses?storeId=` works; no dedicated owner expense history UI |
| HTTP/browser POS E2E in npm scripts | ⚠️ `test:http-session` for auth; full POS flow needs `npm run dev` + manual/browser |
| 10k stress in default audit | ⚠️ Opt-in: `FORENSIC_RUN_STRESS=1` (~90s+) |
| Parallel product create race | ⚠️ Sequential idempotency OK; parallel same-key may race (documented) |

---

## Acceptance criteria checklist

| Area | Status |
|------|:------:|
| No sale without stock | ✅ |
| No negative stock (post-guards) | ✅ |
| FIFO correct | ✅ |
| COGS = Σ(costPerUnit × qty) | ✅ |
| No phantom COGS (+2522) locally | ✅ |
| Owner return via service/API | ✅ |
| Rejected return no financial change | ✅ |
| Expense affects net profit | ✅ |
| Cross-layer financial consistency | ✅ |
| DB reset between scenarios | ✅ |
| Production untouched | ✅ |
| Store period filters | ❌ gap |
| Full browser E2E | ⚠️ partial |

---

## Files added/extended

```
scripts/forensic-lab/lib/independent-calculator.ts  — raw DB financials
scripts/forensic-lab/lib/integrity-checks.ts        — DB integrity + desync injection
scripts/forensic-lab/lib/http-session.ts              — HTTP login helper
scripts/forensic-lab/lib/load-env.ts                  — .env loader for scripts
scripts/forensic-lab/run-extended-audit.ts            — extended scenarios
scripts/forensic-stress-audit.ts                      — full orchestrator
scripts/stress-invariant-scan.ts                      — post-stress scan
```

---

## Do NOT deploy until

1. This report reviewed.
2. Production read-only SQL confirms data root cause.
3. Store filter / owner history gaps triaged separately from COGS fix.
