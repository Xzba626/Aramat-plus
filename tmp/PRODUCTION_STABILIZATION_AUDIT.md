# Production Stabilization — Audit

**Date:** 2026-08-06  
**Rule:** No DB reset / no table drops / no wipe of live sales data.

## Broken (root causes) → status

| # | Issue | Status | Fix |
|---|--------|--------|-----|
| 1 | `InventoryStatus.PENDING_APPROVAL` in schema but never migrated | **FIXED** | `prisma/migrations/20260806200000_inventory_pending_approval` |
| 2 | `PushSubscription` model, no migration | **FIXED** | `prisma/migrations/20260806201000_push_subscription` |
| 3 | `prisma/seed.ts` wiped all business data | **FIXED** | Idempotent upsert seed only; wipe → `seed-demo-wipe.ts` (opt-in) |
| 4 | No PM2 / deploy docs | **FIXED** | `ecosystem.config.js`, `DEPLOYMENT.md`, `.env.example` |
| 5 | Role `ADMIN` missing | **FIXED** | Migration + RBAC `isOwnerClass` / `OWNER_ROLES` (wipe stays OWNER-only) |
| 6 | Neon migrate lag / failed historical migration | **ENV-SPECIFIC** | Contabo: `migrate deploy` after backup. Neon P3009: resolve carefully, never reset |

## Verification (local)

| Check | Result |
|-------|--------|
| `npx prisma generate` | **PASS** |
| `npx tsc --noEmit` | **PASS** |
| `npm run build` | **PASS** (exit 0) |

## Files changed (this pass)

### Migrations (additive only)
- `prisma/migrations/20260806200000_inventory_pending_approval/migration.sql`
- `prisma/migrations/20260806201000_push_subscription/migration.sql`
- `prisma/migrations/20260806202000_role_admin/migration.sql`

### Schema / seed / deploy
- `prisma/schema.prisma` — `Role.ADMIN`, `InventoryStatus.PENDING_APPROVAL`, `PushSubscription`
- `prisma/seed.ts` — safe upsert (4 roles)
- `src/lib/seed-defaults.ts`
- `ecosystem.config.js`
- `DEPLOYMENT.md`
- `.env.example`
- `package.json` — `pm2:start` / `pm2:restart`

### Auth / RBAC
- `src/lib/rbac.ts` — `OWNER_ROLES`, `isOwnerClass`, wipe OWNER-only
- `src/middleware.ts` — ADMIN ≈ owner area; block ADMIN from `/settings/wipe`
- UI/API approve paths: revision, returns, discounts, notifications, nav, packaging cost, etc.

## Must NOT do on Contabo

- `prisma migrate reset`
- `db push --force-reset`
- Old wipe seed / `seed-demo-wipe` without explicit opt-in
- Delete sales / stock / products

## Contabo deploy (after git push)

```bash
# 1) backup first
sudo -u postgres pg_dump aromat_plus > /root/aromat_plus_backup_$(date +%F).sql
ls -lh /root/aromat_plus_backup_*.sql

# 2) update
cd ~/Aramat-plus
git pull
npm install
npx prisma generate
npx prisma migrate deploy
npx prisma db seed   # safe upsert only
npm run build
pm2 restart aramat-plus --update-env
# or: pm2 start ecosystem.config.js --update-env
```

## Default seed users (change passwords after login)

| Role | Email | Password |
|------|-------|----------|
| OWNER | owner@aromat.plus | owner1234 |
| ADMIN | admin@aromat.plus | admin12345 |
| MANAGER | manager@aromat.plus | manager12345 |
| SELLER | seller@aromat.plus | seller12345 |
