# M2 Verification — sellers.create / sellers.assign

**Дата:** 2026-08-09  
**Spec:** [`MANAGER-PERMISSIONS-M2-SPEC.md`](./MANAGER-PERMISSIONS-M2-SPEC.md)  
**Master:** [`MANAGER-MASTER-SPEC.md`](./MANAGER-MASTER-SPEC.md)  
**R1:** remains locked — [`MANAGER-PERMISSIONS-R1-VERIFY.md`](./MANAGER-PERMISSIONS-R1-VERIFY.md)

## Commands

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | **0** |
| `npx tsx scripts/r1-static-verify.mts` | **PASS** (R1 unchanged) |
| `npx tsx scripts/m2-static-verify.mts` | **PASS** (sellers.* default OFF + grantable) |

Runtime HTTP: pending migrate/session on target DB.

---

## Matrix

| # | Test | Expected | Result | Proof |
|---|------|----------|--------|-------|
| 1 | create OFF | 403 | **PASS (code)** | `requirePermission('sellers.create')` on MANAGER `POST /api/users` |
| 2 | assign OFF | 403 | **PASS (code)** | `requirePermission('sellers.assign')` on staff POST/DELETE/candidates |
| 3 | ON + in scope | allow | **PASS (code)** | create forces `SELLER` + `requireStoreAccess`; assign after scope |
| 4 | ON + out-of-scope store | 403 | **PASS (code)** | `requireStoreAccess` on target store (+ source store for pull) |
| 5 | cannot create OWNER | 403 | **PASS (code)** | MANAGER path rejects `role !== SELLER` |
| 6 | cannot create MANAGER | 403 | **PASS (code)** | same |
| 7 | cannot escalate SELLER | blocked | **PASS (code)** | `PATCH /api/users` stays Owner-only; assign does not change role |
| 8 | IDOR userId/storeId | 403 | **PASS (code)** | companyId lookup + scope on from/to store; unassign must match store |
| 9 | OWNER smoke | unchanged | **PASS (static)** | Owner branch of POST users / staff intact |
| 10 | SELLER smoke | no admin | **PASS (static)** | no seller gates opened |
| 11–12 | LEGACY / ALL / SELECTED | scope | **PASS (code)** | same `requireStoreAccess` / authz as R1 |
| 13 | tsc | 0 | **PASS** | |
| 14 | R1 static | PASS | **PASS** | script |

---

## Endpoints touched (no parallel API)

- `POST /api/users` — MANAGER + `sellers.create` → SELLER only  
- `GET/POST/DELETE /api/stores/[id]/staff` — MANAGER + `sellers.assign`  
- Store detail Staff tab — UX hide/show via `/api/me/permissions`  
- OWNER permissions UI — keys already in «Продавцы» group  

## Out of M2 (unchanged)

M3 · M4 · R5 · `stores.create` wire · `/users` page for MANAGER · multi-store Seller · Auth.js / FIFO / transfers
