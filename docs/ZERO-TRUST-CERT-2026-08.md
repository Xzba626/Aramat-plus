# Zero-Trust Commercial Certification — Evidence Log

**Date:** 2026-08-02  
**Mode:** Zero Trust (no PASS without proof)  
**Verdict:** **NOT commercially certified yet** — core modules re-proved; full DoD incomplete (UX deep pass, every button/modal, residual features deferred).

---

## Executive status

| Module | Status | Proof |
|--------|--------|-------|
| Dashboard money model | **PASS** | `npx tsx scripts/zt-dashboard-proof.ts` |
| Bottles subsystem | **PASS** (after fix) | `npx tsx scripts/zt-bottles-proof.ts` |
| Revision + Manager blind API | **PASS** (after fix) | `npx tsx scripts/zt-revision-proof.ts` |
| Customer return chain | **PASS** | `npx tsx scripts/zt-return-proof.ts` |
| Bottle sale E2E (regression) | **PASS** | `npm run test:bottle-sale` |
| HTTP page smoke 3 roles | **PASS** (retry on Neon 500) | `npx tsx scripts/zt-page-smoke.ts` |
| Cross-module expense + discount | **PASS** | `npx tsx scripts/zt-cross-module-proof.ts` |
| Browser Walkthrough (visual) | **PARTIAL** | Login page rendered on `127.0.0.1:3000`. Interactive session login blocked in automation (Auth host / fetch failure). HTTP smoke covers route access per role. |
| Residual (auto gifts, Customer CRM, PDF/Excel archive) | **DEFERRED** | Per DoD §9 — only after full cert |

**Operational risk:** Neon `P1001` / intermittent page `500` under load. Not a product logic FAIL, but blocks continuous green CI.

---

## Defect log (Zero Trust format)

### ZT-001 — Manager could read expected revision qty via API

**Статус:** PASS (fixed + re-proved)

**Сценарий воспроизведения**  
1. Owner/Manager `GET /api/revisions?id={sessionId}`  
2. Response included `expectedQty` / `difference` for Manager  

**Причина**  
`getInventorySessionDetail` always returned expected qty; UI hid column but API leaked.

**Исправление**  
- Role-aware blind payload in `revision.service.ts`  
- API strips variance for non-Owner; APPROVE Owner-only  

**Изменённые файлы**  
- `src/lib/services/revision.service.ts`  
- `src/app/api/revisions/route.ts`  
- `scripts/zt-revision-proof.ts`

**API Proof**  
`zt-revision-proof.ts`: Owner `blind=false` + `expectedQty=10`; Manager `blind=true` without `expectedQty`/`difference`. Stock after approve = 7. `REVISION_APPROVE` in ActivityLog.

**Browser Proof**  
Revision page already hid expected for Manager (`isOwner` gates). API now matches UI.

**Связанные модули**  
Revision → FIFO stock → ActivityLog → Store status

**Тесты**  
`npx tsx scripts/zt-revision-proof.ts` → PASS

**Повторная проверка**  
2026-08-02 PASS

---

### ZT-002 — Dashboard: abs Δ, Net after all opex, bottles in OPEX

**Статус:** PASS

**Сценарий**  
WEIGHT sale 10 ml @ 20 + bottle cost 3; rent expense pre-seeded.

**Причина**  
Needed proof that Wave A claims hold on live math.

**Исправление**  
None required for math (abs already in `pctChange`). Proof script added.

**API Proof**  
```
dRev: 200, dGross: 150, dNet: 147, dExp: 3
bottle expense: type «Флаконы» amount 3
perfume COGS = 50 (bottle not in COGS)
deltas.revenue.abs number; netSparkline length 7; stores sorted by net
```

**Тесты**  
`zt-dashboard-proof.ts` → PASS

---

### ZT-003 — Bottles: no per-store stock on packaging list + notify race

**Статус:** PASS (fixed + re-proved)

**Сценарий**  
Owner opens `/warehouse/packaging` — only warehouse qty visible.  
Low-stock notify was `void` fire-and-forget after sale.

**Причина**  
`listPackagingSkus` only loaded warehouse balances; `createSale` did not await notify.

**Исправление**  
- `storeQtys[]` on packaging list API + UI per store  
- Await `maybeNotifyLowBottleStock` in `createSale`  
- Packaging link in warehouse internal nav; removed duplicate suppliers entries  

**Изменённые файлы**  
- `src/lib/services/packaging.service.ts`  
- `src/app/(owner)/warehouse/packaging/page.tsx`  
- `src/lib/services/sale.service.ts`  
- `src/lib/navigation/warehouse-nav.ts`  
- `src/messages/ru.json`, `tj.json`  
- `scripts/zt-bottles-proof.ts`

**API Proof**  
receive 10 → transfer 5 → storeQtys=5 / WH=5 → sale → store=4 → OPEX 2 → notification title `Мало флаконов` entityId=bottle.

**Тесты**  
`zt-bottles-proof.ts` → PASS; `test:bottle-sale` → PASS

---

### ZT-004 — Customer return auto chain

**Статус:** PASS

**Сценарий**  
Seller request → Owner notify → Owner approve (no manual recreate) → stock +1 → revenue −100 → ActivityLog REQUEST+APPROVE.

**Тесты**  
`zt-return-proof.ts` → PASS

---

### ZT-005 — Demo Manager/Seller missing after wipe / wrong seller store

**Статус:** PASS (ops fix)

**Сценарий**  
`manager@aromat.plus` missing → Manager login fail. Seller bound to OWNER_DIRECT → POS 500 risk.

**Исправление**  
- `scripts/zt-ensure-users.ts`  
- `scripts/zt-bind-seller.ts` (BRANCH only)

**Повторная проверка**  
Page smoke Manager+Seller PASS after fix.

---

## Page smoke (Browser/HTTP Proof)

Command: `npx tsx scripts/zt-page-smoke.ts` (attempt 2 after Neon blip)

- Owner: 25 primary routes 200; `/pos` → dashboard  
- Manager: same minus blocked; `/users`, `/settings/wipe`, `/warehouse/write-offs` → dashboard  
- Seller: all POS routes 200; owner routes → `/pos`

---

## Definition of Done checklist

1. All pages checked — **PARTIAL** (HTTP smoke + critical routes; not every button/modal)  
2. All roles — **PARTIAL** (HTTP yes; visual Owner walk incomplete)  
3. All business scenarios — **PARTIAL** (Dashboard/Bottles/Revision/Returns proved; wipe/discount/gift/transfer deep chains pending)  
4. Cross-module links — **PARTIAL**  
5. UX cert — **PARTIAL** (suppliers removed from warehouse nav; packaging store stock labels)  
6. Dedup — **PARTIAL** (warehouse suppliers duplicate removed)  
7. All defects fixed — **open** until full walk done  
8. Re-proof after fix — **yes** for ZT-001…005  
9. No claim without evidence — **this document**  
10. Residual features — **not started** (correct)

---

## How to re-run proofs

```bash
npx tsx scripts/zt-ensure-users.ts
npx tsx scripts/zt-bind-seller.ts
npx tsx scripts/zt-dashboard-proof.ts
npx tsx scripts/zt-bottles-proof.ts
npx tsx scripts/zt-revision-proof.ts
npx tsx scripts/zt-return-proof.ts
npm run test:bottle-sale
npx tsx scripts/zt-page-smoke.ts
```

Use host `http://127.0.0.1:3000` consistently (AUTH cookies break across `localhost` / LAN IP).
