# M2 Verification — sellers.create / sellers.assign

**Дата:** 2026-08-09  
**Spec:** [`MANAGER-PERMISSIONS-M2-SPEC.md`](./MANAGER-PERMISSIONS-M2-SPEC.md)  
**Master:** [`MANAGER-MASTER-SPEC.md`](./MANAGER-MASTER-SPEC.md)  
**R1:** locked — [`MANAGER-PERMISSIONS-R1-VERIFY.md`](./MANAGER-PERMISSIONS-R1-VERIFY.md)

## Project status

```text
R1  — audited and verified statically
M2  — COMPLETE (sellers.create / sellers.assign / unassign / candidates / Manager UI)
M2 static verification — PASS
Runtime HTTP — PENDING (blocker below) — not claimed PASS
stores.create — DEFERRED (not part of M2)
M3 / M4 / R5 — NOT STARTED
```

## Commands (static)

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | **0** |
| `npx tsx scripts/r1-static-verify.mts` | **PASS** |
| `npx tsx scripts/m2-static-verify.mts` | **PASS** |
| `npx tsx scripts/m2-runtime-http.mts` | **not run to completion** (blocker) |

## Static / code matrix

| # | Test | Expected | Result | Proof |
|---|------|----------|--------|-------|
| 1 | create OFF | 403 | **PASS (code)** | `requirePermission('sellers.create')` |
| 2 | assign OFF | 403 | **PASS (code)** | `requirePermission('sellers.assign')` |
| 3 | ON + in scope | allow | **PASS (code)** | create + `requireStoreAccess` |
| 4 | ON + out-of-scope | 403 | **PASS (code)** | scope on store |
| 5–6 | cannot create OWNER/MANAGER | 403 | **PASS (code)** | force SELLER only |
| 7 | no escalate | blocked | **PASS (code)** | PATCH users Owner-only |
| 8 | IDOR | 403 | **PASS (code)** | company + scope |
| 9–10 | OWNER / SELLER smoke | unchanged | **PASS (static)** | |
| 11–12 | LEGACY / ALL / SELECTED | scope | **PASS (code)** | |
| 13–14 | tsc / R1 static | PASS | **PASS** | |

## Runtime HTTP matrix (#1–14)

Script ready: [`scripts/m2-runtime-http.mts`](../scripts/m2-runtime-http.mts)  
Base: `ZT_BASE_URL` (default `http://127.0.0.1:3000`)

| # | Test | Expected | Result |
|---|------|----------|--------|
| 1 | MANAGER + sellers.create OFF | 403 | **PENDING** |
| 2 | MANAGER + sellers.create ON → create SELLER | 201 | **PENDING** |
| 3 | store вне scope | 403 | **PENDING** |
| 4 | ALL_STORES → разрешённые магазины | OK | **PENDING** |
| 5 | SELECTED_STORES → только выбранные | OK / 403 | **PENDING** |
| 6 | LEGACY_SINGLE → только storeId | OK / 403 | **PENDING** |
| 7 | попытка создать MANAGER | 403 | **PENDING** |
| 8 | попытка создать OWNER | 403 | **PENDING** |
| 9 | sellers.assign OFF | 403 | **PENDING** |
| 10 | assign в scope | OK | **PENDING** |
| 11 | assign вне scope | 403 | **PENDING** |
| 12 | unassign вне scope | 403 | **PENDING** |
| 13 | OWNER flow | no regression | **PENDING** |
| 14 | SELLER flow | no admin | **PENDING** |

### Runtime blocker (2026-08-09, rechecked)

Attempted again during status-lock stage:

1. `npx prisma migrate deploy` → **P3009**: failed migration `20260731180000_stage5_supplier_purchases` on Neon — blocks later migrations including `20260809110000_manager_permissions`.
2. Local Docker Postgres (`docker compose up`) → **Docker CLI not installed / not on PATH**.
3. App on `http://127.0.0.1:3000` → connection refused (dev server not running).
4. Script [`scripts/m2-runtime-http.mts`](../scripts/m2-runtime-http.mts) is ready; matrix rows remain **PENDING** (not PASS).

**Ops to unblock (explicit decision required):** resolve or repair the failed Neon migration (`prisma migrate resolve` only after confirming SQL already applied), then `migrate deploy` → `npm run dev` → `npx tsx scripts/m2-runtime-http.mts` → fill this table.

Do **not** force-reset production Neon from this agent stage without owner approval.

## Out of M2

M3 · M4 · R5 · `stores.create` wire · multi-store Seller · Auth.js / FIFO / transfers
