# RBAC — Роли и права доступа

**Source of truth (MANAGER):** [`docs/MANAGER-MASTER-SPEC.md`](./MANAGER-MASTER-SPEC.md)

> Менеджер управляет **движением** товара, не **стоимостью**.  
> `sales.create` = **DEFAULT OFF**. OWNER UI: `/users` → Права. Exact stock = bands only.

## Роли

| Роль | Код | Описание |
|------|-----|----------|
| Owner | `OWNER` / `ADMIN` | Бизнес + деньги + каталог + склад + настройки + права MANAGER |
| Manager | `MANAGER` | Ops в store scope — без finance / exact qty / catalog write |
| Seller | `SELLER` | POS своего магазина + подтверждение приёмки |

## Код

- `src/lib/rbac.ts` + `src/lib/permissions/*` — один authz path
- Never-grantable keys не пишутся в БД
- Scope: `LEGACY_SINGLE | ALL_STORES | SELECTED_STORES`
