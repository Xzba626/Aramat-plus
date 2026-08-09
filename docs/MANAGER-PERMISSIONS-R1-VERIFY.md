# R1 Verification — MANAGER permissions vs MASTER SPEC

**Дата:** 2026-08-09  
**Master:** [`MANAGER-MASTER-SPEC.md`](./MANAGER-MASTER-SPEC.md)  
**Правило:** `tsc=0` ≠ done — ниже матрица поведения / static proof.

## Commands

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | **0 errors** (2026-08-09) |
| `npx prisma validate` | **valid** |
| `npx tsx scripts/r1-static-verify.mts` | never∩grantable PASS · sales.* default OFF PASS · PUT never skip PASS · qty scrub PASS |

Runtime HTTP (curl against live DB): **pending** until `npx prisma migrate deploy` on target env — static/code proofs below.

---

## Matrix

| Test | Role | Expected | Result | Proof |
|------|------|----------|--------|-------|
| Finance APIs (expenses, analytics, dashboard, export) | MANAGER | 403 | **PASS** | `requireOwner` on routes |
| COGS / profit in DTO | MANAGER | scrubbed | **PASS** | `stripFinanceForRole` |
| Exact stock any endpoint | MANAGER | no qty / unitsTotal / warehouseQty | **PASS** | bands on `stores/[id]/stock`; `stripExactStockForManager` on stores list/detail, products, transfers, packaging-skus, packaging-bottles, return-in, store returns/revisions |
| Warehouse stock | MANAGER | 403 | **PASS** | `warehouse/stock` → `requireOwner` for MANAGER |
| Product / price / cost / batch / stock adjust writes | MANAGER | 403 | **PASS** | `requireOwner` on mutations (products, brands, categories, units, batches, price, cost, initial-stock) |
| Out-of-scope store | MANAGER | 403 | **PASS** | `requireStoreAccess` / `assertStoreInScope` on store-scoped routes |
| sales.create OFF | MANAGER | 403 | **PASS** | `requirePermission(user, "sales.create")`; key not in `DEFAULT_MANAGER_GRANTS` |
| sales.create ON + in scope | MANAGER | allowed + finance scrub | **PASS (code)** | sales POST gates + `stripFinanceForRole`; runtime pending migrate |
| sales out of scope | MANAGER | 403 | **PASS (code)** | `requireStoreAccess` on sale storeId |
| Never-grantable PUT | OWNER | not stored | **PASS** | `saveManagerPermissions` skips `NEVER_GRANTABLE_SET`; script confirms `finance.view` dropped |
| Permissions PUT | MANAGER/SELLER | 403 | **PASS** | route `requireOwner` |
| OWNER smoke | OWNER | unchanged write paths | **PASS (static)** | Owner bypass / `requireOwner` not tightened for Owner |
| SELLER smoke | SELLER | POS unchanged | **PASS (static)** | seller branches intact; packaging-bottles seller strip unchanged |
| Scope LEGACY / ALL / SELECTED | MANAGER | as SPEC | **PASS (code)** | `loadManagerAuthz` + `resolveScopedStoreFilter` on stores/transfers/sales/revisions/return-in |
| `GET /api/warehouses` | MANAGER | id/name only, no stock | **PASS** | select `{ id, name, isActive }` |
| Middleware `/revision` | MANAGER | UI blocked (R5) | **PASS / documented** | middleware blocklist; `inventory.audit.create` key ON but POST create Owner-only until R5 |
| Catalog write missed | MANAGER | 403 | **PASS** | units / product-types / operation-types / brands / categories / suppliers / packaging POST-PATCH Owner |

---

## Gaps fixed in this audit

1. Store list/detail / products / transfers — exact qty scrub (`stripExactStockForManager`).
2. Packaging SKUs `warehouseQty` / `storeQtys.qty` scrub (+ `qty`/`storeQtys` keys).
3. `GET /api/warehouses` — MANAGER id/name-only.
4. Packaging bottles — scope + scrub for MANAGER.
5. Revisions list — multi-store scope + `inventory.audit.view`.
6. Return-in — multi-store scope + scrub.

---

## Remaining (explicitly out of R1)

- **M2** — `sellers.create` / `sellers.assign` wire  
- **M3** — transfer `SENT` → `RECEIVED` → `DISCREPANCY`  
- **M4** — Manager dashboard  
- **R5** — `inventory.audit.create` POST + `/revision` UI reopen  
- Runtime HTTP matrix after migrate on staging/prod
