# RBAC — Роли и права доступа

## Роли

| Роль | Код | Описание |
|------|-----|----------|
| Owner | `OWNER` | Полный доступ ко всем модулям |
| Manager | `MANAGER` | Права по назначению владельца (магазины/склад) |
| Warehouse | `WAREHOUSE_MANAGER` | Склад, партии, перемещения |
| Seller | `SELLER` | Только свой магазин (POS); без себестоимости и аналитики |

## Матрица прав (Milestone 1)

| Ресурс | Owner | Manager | Seller |
|--------|-------|---------|--------|
| Справочники (CRUD) | ✅ | ✅ | ❌ |
| Товары / партии | ✅ | ✅ | ❌ |
| Склад | ✅ | ✅ | ❌ |
| Магазины | ✅ | ✅ | ❌ |
| Перемещения | ✅ | ✅ | ❌ |
| Пользователи | ✅ | ❌ | ❌ |
| Dashboard | ✅ | ✅ | ❌ |
| POS | ✅ | ✅ | ✅ (stub) |

## Post-login redirect

- `OWNER`, `MANAGER` → `/dashboard`
- `SELLER` → `/pos`

## Auth flows

- Login / Logout — credentials provider
- Смена пароля — authenticated user
- Password reset — admin reset by Owner (email позже)
- Self-registration отсутствует — пользователей создаёт Owner

## Реализация

- `src/middleware.ts` — route protection
- `src/lib/rbac.ts` — `requireRole()`, `hasPermission()`
- API routes проверяют роль через session
