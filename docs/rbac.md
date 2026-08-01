# RBAC — Роли и права доступа

## Роли

| Роль | Код | Описание |
|------|-----|----------|
| Owner | `OWNER` | Полный доступ ко всем модулям |
| Manager | `MANAGER` | Операционный доступ: склад, магазины, продажи — без админки пользователей, CRM wipe, списаний и утверждения скидок/возвратов |
| Seller | `SELLER` | Только свой магазин (POS); без себестоимости и аналитики |

## Матрица прав (Milestone 1)

| Ресурс | Owner | Manager | Seller |
|--------|-------|---------|--------|
| Справочники (CRUD) | ✅ | ✅ | ❌ |
| Товары / партии | ✅ | ✅ | ❌ |
| Склад | ✅ | ✅ | ❌ |
| Списания (`/warehouse/write-offs`) | ✅ | ❌ | ❌ |
| Магазины (просмотр) | ✅ | ✅ | ❌ |
| Создание / архив магазинов | ✅ | ❌ | ❌ |
| Перемещения | ✅ | ✅ | ❌ |
| Пользователи (`/users`) | ✅ | ❌ (UI + middleware) | ❌ |
| CRM wipe (`/settings/wipe`) | ✅ | ❌ | ❌ |
| Утверждение скидок / возвратов | ✅ | ❌ (очередь read-only) | ❌ |
| Журнал (`GET /api/journal`) | ✅ | ✅ | ❌ |
| Dashboard | ✅ | ✅ | ❌ |
| POS | ✅ | ✅ | ✅ |

> **Примечание:** `GET /api/users` может оставаться `OwnerOrManager` на уровне API (например, для назначения персонала), но UI и middleware блокируют `/users` для Manager.

## Post-login redirect

- `OWNER`, `MANAGER` → `/dashboard`
- `SELLER` → `/pos`

## Auth flows

- Login / Logout — credentials provider
- Смена пароля — authenticated user
- Password reset — admin reset by Owner (email позже)
- Self-registration отсутствует — пользователей создаёт Owner

## Реализация

- `src/middleware.ts` — route protection (Seller → POS; Manager blocked from `/users`, `/settings/wipe`, `/warehouse/write-offs`)
- `src/lib/navigation/owner-nav.ts` — nav items filtered by role (write-offs, wipe — Owner only)
- `src/lib/rbac.ts` — `requireRole()`, `hasPermission()`
- API routes проверяют роль через session
