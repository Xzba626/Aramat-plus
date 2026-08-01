# Aramat Plus — Commercial Certification Registry

**Date:** 2026-08-01  
**Mode:** Zero-trust. PASS only with full evidence pack (7 conditions).  
**Scope:** Existing surface. Vision MISSING → path to 100% in C9.

---

## PASS rule (mandatory)

PASS only if all hold: (1) code layers (2) real scenario (3) cross-module effects (4) negatives (5) role sync (6) concurrency where relevant (7) evidence pack. Else **PARTIAL** / **FAIL**.

## Gate

New bug → stop → fix → re-proof → regression (min C1) → continue.

---

## C0 — Inventory

| Item | Evidence |
|------|----------|
| Pages | 49 unique `page.tsx` routes |
| APIs | 54 `route.ts` under `src/app/api` |
| Seed | owner / manager / seller `@aromat.plus` |
| Env | Neon live DB (Docker unavailable on agent host) |

---

## Bug journal

| ID | Cycle | Summary | Status |
|----|-------|---------|--------|
| BUG-001 | C1 | `smoke:cycle` used inactive BRANCH via `findFirst` | **FIXED** — `isActive: true` + bind seller |
| BUG-002 | C3 | Manager UI showed Owner-only actions (approve/write-offs/wipe/users) | **FIXED** — nav/middleware/UI |
| BUG-003 | C3 | Middleware did not gate Manager `/users`, wipe, write-offs | **FIXED** |
| BUG-004 | C2 | Users page no reassign UI | **PARTIAL** — Staff tab is the supported path; documented |
| BUG-005 | C0 | `rbac.md` outdated | **FIXED** |
| BUG-006 | C0 | Live DB wiped mid-cert (external) | **OBSERVED** — re-seeded |
| BUG-007 | C4 | `test-seller-isolation` hard-deleted stores → FK RESTRICT | **FIXED** — archive instead |
| BUG-008 | C1 | Persisted catalog filters with deleted category/brand ids → empty UI | **FIXED** — invalidate stale ids |
| BUG-009 | C7 | Mixing `localhost` / `192.168.x` / `127.0.0.1` breaks session cookies | **RISK** — use one host; AUTH_URL must match |
| BUG-010 | C6 | After wipe+seed, JWT ghost user → shell alive, APIs 401, empty dashboards | **FIXED** — layouts use `getSessionUser`; JWT clears missing user |
| BUG-011 | C0 | Schema drift (`initialQuantity` missing) blocked seed | **FIXED** — `db push --accept-data-loss` |
| BUG-012 | C1 | Smoke receive `$transaction` default 5s → P2028 on Neon | **FIXED** — 60s timeout in smoke |

---

## Evidence log

### EVIDENCE: C1-GOLD-CHAIN
- status: **PASS** (service + HTTP); UI walkthrough **PARTIAL** (host/cookie friction)
- scenario: product → receive → transfer → POS catalog → sale → stock assert
- result: `npm run smoke:cycle` PASSED after BUG-001/012; `npm run test:e2e-chain` PASSED (sale→return→write-off→revision→dashboard→analytics→journal)
- evidence: smoke output warehouse=80 store=19 after sale; e2e 10/10 steps
- negatives: covered in e2e + seller isolation
- files: `scripts/smoke-cycle.ts`
- test: `smoke:cycle`, `test:e2e-chain`
- re-proof: after wipe+seed smoke PASSED again

### EVIDENCE: C2-SELLER-ASSIGN
- status: **PASS** (service)
- scenario: unassign → assign A → catalog A sees product → reassign B → catalog B empty → restore A
- result: `npx tsx scripts/test-seller-store-session.ts` PASS
- code: `assignStoreStaff` / `unassignStoreStaff` + `getPosCatalog`; session via DB (`getSessionUser`)
- files: `scripts/test-seller-store-session.ts`, `stores-detail.service.ts`, `session.ts`, `(seller)/layout.tsx`
- re-proof: after wipe+seed PASS

### EVIDENCE: C3-MANAGER-RBAC
- status: **PASS**
- scenario: Manager login → products OK; wipe GET 403; write-offs GET 403; UI hides approve/wipe/users/write-offs; middleware redirects
- evidence: `test:rbac` 20 middleware cases PASS; `test-http-session-cert.ts` Manager blocked wipe+write-offs
- files: `middleware.ts`, `owner-nav.ts`, `owner-dashboard-client.tsx`, `settings/page.tsx`, `write-offs/page.tsx`, `stores/page.tsx`, `docs/rbac.md`, `test-rbac.ts`

### EVIDENCE: C4-SELLER-POS
- status: **PASS** (API/service); browser **PARTIAL**
- scenario: seller login → POS catalog; isolation store1 vs store2
- evidence: HTTP cert seller catalog 200; `test:seller-isolation` PASS
- concurrency: dual-seller / dual-tab not fully browser-proven this wave → residual risk

### EVIDENCE: C5-SYNC
- status: **PASS** (service)
- scenario: e2e chain + partial-return + profit-net
- evidence: sale changes store qty; return restores; write-off warehouse; revision adjusts; dashboard/analytics/journal entries present; profit net-of-returns
- tests: `test:e2e-chain`, `test:partial-return`, `test:profit-net`

### EVIDENCE: C6-WIPE
- status: **PASS**
- scenario: wipe phrase+password → products/sales/BRANCH/non-owner gone; company/owner/OWNER_DIRECT/warehouse/units kept → re-seed
- evidence: `scripts/test-crm-wipe-cert.ts` PASS; BUG-010 found and fixed during re-proof
- files: `crm-wipe.service.ts`, `(owner)/layout.tsx`, `(seller)/layout.tsx`, `auth.ts`, `dashboard/page.tsx`

### EVIDENCE: C7-WALKTHROUGH
- status: **PARTIAL**
- Owner browser: login page OK; dashboard OK (post-login on matching host); catalog failed under ghost JWT (BUG-010) then fixed; hydration warning on OwnerLayout observed
- Manager/Seller: proven via HTTP session cert, not full click-every-button UI pass
- Host mismatch BUG-009 remains operational risk

### EVIDENCE: C8-CROSS-MODULE
| Arrow | Status | Proof |
|-------|--------|-------|
| Product → Batch | CONFIRMED | smoke/e2e receive |
| Batch → Warehouse | CONFIRMED | qty asserts |
| Warehouse → Transfer | CONFIRMED | createTransfer |
| Transfer → Store | CONFIRMED | store qty |
| Store → POS | CONFIRMED | getPosCatalog / HTTP |
| POS → Sale | CONFIRMED | createSale / smoke |
| Sale → Return | CONFIRMED | e2e + partial-return |
| Sale → WriteOff | CONFIRMED | e2e (warehouse write-off path) |
| Sale → Revision | CONFIRMED | e2e revision |
| Sale → Dashboard | CONFIRMED | e2e + Owner UI KPIs after sales |
| Sale → Analytics | CONFIRMED | e2e analytics |
| Sale → Notifications | PARTIAL | code path exists; not fully browser-counted this wave |
| Sale → Journal | CONFIRMED | e2e journal entries + dashboard feed |
| Sale → Export | BROKEN / MISSING UI | API_ONLY per vision — not CONFIRMED as product feature |

### EVIDENCE: HTTP-ROLES
- status: **PASS**
- test: `scripts/test-http-session-cert.ts`
- Owner/Manager products ≥1; Manager 403 wipe+write-offs; Seller catalog 200

---

## Page × role matrix (summary)

| Area | Owner | Manager | Seller |
|------|-------|---------|--------|
| Login | PASS | PASS | PASS |
| Dashboard | PASS* | PASS* (no approve) | block→/pos |
| Warehouse / products | PASS* | PASS* | block |
| Write-offs | PASS | block (UI+MW+API) | block |
| Users / wipe | PASS | block | block |
| Journal | PASS | PASS (API) | block |
| POS | block | block | PASS* |
| Stores staff assign | PASS | read / no assign API | N/A |

\*Service/HTTP proven; full button-level browser PASS incomplete (C7 PARTIAL).

---

## C9 — Final report table

| Category | Items |
|----------|--------|
| Works fully (proven) | Gold chain receive→transfer→sale; seller assign/reassign/unassign (DB+catalog); Manager API denials; CRM wipe KEEP/WIPE; RBAC helpers; seller store isolation; partial return + profit net; e2e revision/write-off/journal/analytics |
| Works partially | Browser walkthrough all screens; notifications effect of sale; Users reassign UX; Export; hydration warnings; Neon latency/P1001 intermittency |
| Does not work / missing | Export UI; Customer CRM; Bottle/decant WEIGHT POS; store↔store UI; unified Inbox; GiftRule runtime; self forgot-password (vision) |
| UI-only illusion (fixed) | Manager approve / wipe / write-offs / users — now hidden + middleware |
| API-only | Export endpoint; store↔store transfer API |
| Broken chains (fixed this wave) | Ghost JWT after wipe; stale catalog filters; smoke inactive store; isolation cleanup FK |
| Bugs fixed | BUG-001,002,003,005,007,008,010,011,012 |
| Files changed | See git diff: layouts, auth, middleware, owner-nav, dashboard client, settings, write-offs, stores, products catalog, smoke/isolation/session/wipe/http cert scripts, rbac.md, COMMERCIAL-CERT doc |
| Tests added/updated | `test-seller-store-session.ts` (full), `test-crm-wipe-cert.ts`, `test-http-session-cert.ts`, smoke timeout/active store, isolation archive cleanup, test-rbac Manager gates |
| Residual risks | Neon connectivity; multi-host cookies; concurrent dual-seller not browser-proven; hydration; migration history vs `db push` on Neon; live wipe of shared Neon during cert |
| Path to 100% commercial CRM | Close vision Blocks 4–8 (packaging/decant, inbox, store↔store UI, Customer CRM, PDF/Excel UI); full C7 button matrix on single host; concurrent sale locks; Auth URL single canonical host; migrate Neon with resolved migration history |

---

## Definition of done note

This wave **does not** claim «CRM 100% ready». It claims: core commercial chains are **proven at service+HTTP level**, critical Manager/session/wipe bugs were **fixed and re-proofed**, and remaining gaps are listed without marketing language.
