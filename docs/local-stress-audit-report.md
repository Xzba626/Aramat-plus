# Local stress test & environment audit

**Branch:** `fix/edit-shop-expenses`  
**Production:** NOT touched  
**Last updated:** 2026-08-28

---

## Part 1 — Git state & change classification

### Branch / commits

- Current branch: `fix/edit-shop-expenses`
- HEAD: `1ed7b1a` feat(expenses): add shop expense editing
- Uncommitted audit fixes on top (see below)

### Uncommitted changes (keep — do NOT `git reset --hard`)

| File | Class | Action |
|------|-------|--------|
| `src/lib/services/profit.service.ts` | **A** | Keep — financial invariants, return netting |
| `src/lib/services/sale.service.ts` | **A** | Keep — batch guards, assertSaleFinancialInvariants |
| `src/lib/services/stock.service.ts` | **A** | Keep — assertBatchStockCoversSale |
| `src/lib/services/product-create.service.ts` | **A** | Keep — product create idempotency |
| `src/app/api/products/route.ts` | **A** | Keep — dedup double POST |
| `src/app/(owner)/warehouse/new/page.tsx` | **A** | Keep — loading guard + idempotency key |
| `src/components/pos/owner-direct-pos-client.tsx` | **A** | Keep — name · SKU disambiguation |
| `src/lib/services/stores-detail.service.ts` | **A** | Keep — unified KPI via profit.service |
| `src/lib/services/stores-list.service.ts` | **A** | Keep — unified KPI |
| `src/lib/services/analytics.service.ts` | **A** | Keep — discount-aware line revenue |
| `src/lib/db-safety-guard.ts` | **A** | Keep — local/production separation |
| `scripts/forensic-env-guard.ts` | **C** | Keep — re-exports db-safety-guard |
| `scripts/*-forensic*.ts`, `test-control-case*.ts` | **C** | Keep — diagnostic/regression |
| `scripts/setup-local-postgres.ps1` etc. | **C** | Keep — local infra (no Docker) |
| `docs/LOCAL-DEV.md` | **C** | Keep — local setup docs |
| `docs/forensic-harizma-report.md` | **C** | Keep — forensic notes |
| `tmp/photo-upload-debug.json` | **B/E** | Do not commit — temp debug |

---

## Part 2 — Local vs production

| Check | Status |
|-------|--------|
| `.env` → `localhost:5432/aromat_plus` | OK (local) |
| `assert-local-db.ts` before `db:recreate-local` | Added |
| `db-safety-guard.ts` blocks non-local destructive ops | Added |
| `FORENSIC_ALLOW_REMOTE=1` for read-only remote audit only | Existing |
| Production migration/seed/reset | **Never run from this workflow** |

---

## Part 3 — Local DB restore flow (no Docker)

PostgreSQL 16 service `postgresql-x64-16` on port 5432.

```powershell
$env:PGPASSWORD = "aromat"
npm run db:recreate-local
npx prisma migrate deploy
npm run db:seed
```

Login: `owner@aromat.plus` / `owner1234`

---

## Part 4 — Stress dataset

| Mode | Env | Products | Stores | Sales target |
|------|-----|----------|--------|--------------|
| normal (default) | — | 1 000 | 5 branch + OWNER_DIRECT | ~400 + 80 OD |
| stress | `STRESS_SEED_MODE=stress` | 10 000 | 10 + OD | ~2000 + 200 OD |

```powershell
npm run db:seed:stress
# stress mode:
$env:STRESS_SEED_MODE = "stress"
npm run db:seed:stress
```

---

## Part 5+ — Test commands

```powershell
npm run test:regression-gate
npm run test:fifo-regression
npm run test:analytics-audit
npm run test:owner-sales-forensic
npx tsc --noEmit
npm run build
```

---

## Bugs found / fixed (rolling log)

| BUG-ID | Status | Notes |
|--------|--------|-------|
| COGS-PROD-01 | open on production data | Phantom SaleItem hypothesis — needs read-only SQL |
| LOCAL-DB-01 | fixed | aromat user lacked table ownership — recreate-local |
| LOCAL-ENV-01 | fixed | Docker not required; PG16 service sufficient |

---

## Production safety

- No production DATABASE_URL in local `.env`
- No production migrations applied
- No production UPDATE/DELETE
