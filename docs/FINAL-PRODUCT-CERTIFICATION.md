# FINAL PRODUCT CERTIFICATION — Aramat Plus CRM

**Date:** 2026-08-03 (updated RC8–RC15)  
**Mode:** Release Candidate — evidence-first  
**Order (approved):** Final RC (RC0–RC15) → **Feature Freeze** → Phase X → Phase Y → final pilot cert  

> Note: Phase X/Y shell code landed early in the same day as RC0–RC7. **Business feature freeze still applies.** RC8–RC15 below close the commercial-integrity gaps before calling product READY.

---

## 1. Overall readiness

### Verdict: **PILOT ONLY** (approaching commercial; not unsupervised 100-branch yet)

| Gate | Result |
|------|--------|
| RC0–RC7 (roles, IDOR C1/C2, chains, i18n, security) | **PASS** (see prior sections / scripts) |
| RC8 Data integrity (sale → stock/FIFO/dash/journal/COGS) | **PASS** `zt-rc8-data-integrity.ts` |
| RC9 Transaction atomicity (oversell rollback) | **PASS** `zt-rc9-transaction-atomicity.ts` |
| RC10 Performance baseline (numbers saved) | **PASS** `tmp/rc10-perf-baseline.json` |
| RC11 Database health | **PASS** `zt-rc11-db-health.ts` (orphans cleaned) |
| RC12 Stress (light concurrent) | **PASS** light; **full 10k/500k NOT RUN** |
| RC13 Backup/restore | **PASS** procedure; **automated restore drill PENDING** staging |
| RC14 Upgrade / migrations | **PASS** 17 migrations; formal mig for PushSubscription before prod |
| RC15 Error recovery UX | **PASS** 401/403 safe codes; no stack leak |
| Gift POS auto-apply | **OUT OF SCOPE** |
| Full Android browser / PWA field install | **PENDING** device |
| Commercial pilot with real sellers (Y30) | **PENDING** |

**Critical blockers for multi-store commercial:** none remaining from C1/C2/integrity/atomicity.  
**Why not READY FOR PRODUCTION:** full stress + restore drill + device PWA + gift honesty + real pilot feedback still open.

### Feature freeze (now)

- **No new business features** (no gift engine, no new modules).
- Allowed: bugfixes from RC findings, ops (migrations, backup drills), then Phase X polish (thumbnails), then Phase Y.

---

## 2. RC8 — Data Integrity

Script: `scripts/zt-rc8-data-integrity.ts`

| Check | Status | Detail |
|-------|--------|--------|
| stock_decreased | PASS | 10 → 8 (−2) |
| fifo_batch_decreased | PASS | 10 → 8 |
| sale_has_items | PASS | 1 |
| dashboard_revenue | PASS | Δ +100 |
| journal_non_decreasing | PASS | +1 |
| sale_cogs_recorded | PASS | cogs=40 |

---

## 3. RC9 — Transaction Failure

Script: `scripts/zt-rc9-transaction-atomicity.ts`

| Check | Status |
|-------|--------|
| createSale uses `$transaction` | PASS |
| Oversell: no stock change, no sale row | PASS |
| Happy path stock+sale | PASS |
| Known: activity log may be outside TX (post-commit) | DOCUMENTED PASS |

Never observed: stock deducted without sale (or reverse) on failed oversell.

---

## 4. RC10 — Performance Baseline

File: `tmp/rc10-perf-baseline.json` (HTTP round-trip p50, not browser TTI)

| Path | p50 ms (sample) |
|------|-----------------|
| `/dashboard` | ~5663 |
| `/api/dashboard` | ~3885 |
| `/warehouse` | ~2743 |
| `/api/warehouse/stock` | ~1355 |
| `/notifications` | ~901 |
| `/api/notifications` | ~3134 |
| `/api/notifications/count` | ~3292 |
| `/pos` | ~955–1338 |
| `/api/pos/catalog` | (see file) |

Re-measure after Phase X thumbnail/cache work to prove improvement.

---

## 5. RC11 — Database Health

Script: `scripts/zt-rc11-db-health.ts` (+ one-time `zt-rc11-cleanup-orphans.ts`)

| Check | Status |
|-------|--------|
| negative stock / batch | PASS |
| sale without items | PASS (cleaned 1 orphan) |
| transfer without items | PASS (cleaned 1 orphan) |
| orphan sale items / missing product | PASS |
| seller/manager without store | PASS |

---

## 6. RC12–RC15

Script: `scripts/zt-rc12-15-ops-cert.ts`

| ID | Status | Notes |
|----|--------|-------|
| RC12 | PASS light | 20× parallel dashboard ~18s. Scale stress **not run**. |
| RC13 | PASS procedure | `pg_dump` / restore checklist; staging drill pending |
| RC14 | PASS | migrate deploy path; add SQL migration for PushSubscription before prod |
| RC15 | PASS | 403 FORBIDDEN / 401 UNAUTHORIZED; `handleApiError` sanitizes |

---

## 7. Prior RC0–RC7 (summary)

C1 IDOR PASS · C2 purge PASS · Owner smoke-cycle PASS · Return/Revision/Cross-module PASS · Manager isolation PASS · Seller POS PASS · i18n key parity PASS · Export cost stripped · packaging `?? 1` removed · OWNER_DIRECT after wipe.

Evidence scripts under `scripts/zt-*.ts` and earlier sections of this file history.

---

## 8. Roadmap after this cert

```text
1. Feature freeze (business logic)
2. Ops: formal PushSubscription migration · staging backup restore drill · optional scale seed stress
3. Phase X polish — especially X2 multi-size thumbnails (100/300/800)
4. Phase Y — Y1–Y20 plus Y21–Y30 (battery, adaptive refresh, memory/long-session, Android install matrix, cold/warm, cache corruption, offline recovery, commercial pilot)
5. Final READY FOR PRODUCTION only after pilot (Y30) + stress + restore drill
```

### Phase Y additions (Y21–Y30) — backlog after X

| ID | Topic |
|----|--------|
| Y21 | Battery-friendly (no poll when backgrounded) |
| Y22 | Adaptive refresh (30s on Dashboard; none when hidden) |
| Y23 | Memory leak hour certification |
| Y24 | Animation audit on weak Android |
| Y25 | 12h long session |
| Y26 | Install on Android 11–15 |
| Y27 | Cold vs warm cache timings |
| Y28 | Cache corruption recovery |
| Y29 | Offline → online auto sync |
| Y30 | Commercial pilot with real staff |

### X2 enhancement (required in Phase X polish)

Auto-generate **thumbnail / small / medium / large** on upload — not only single `/uploads` file.

---

## 9. Certification statement

> Aramat Plus RC now includes **data integrity**, **transaction atomicity**, **DB health**, **perf baseline**, **error sanitization**, and **ops checklists** (RC8–RC15).  
> Status remains **PILOT ONLY**: suitable for limited pilot under feature freeze.  
> **READY FOR PRODUCTION** requires: staging restore drill, scale stress, device PWA/Android matrix, gift policy resolution, and real-user pilot (Y30).
