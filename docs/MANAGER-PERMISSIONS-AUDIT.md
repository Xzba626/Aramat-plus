# MANAGER Permissions — Audit (AS-IS vs TZ)

**Статус:** ANALYSIS ONLY — код не менялся.  
**Дата:** 2026-08-09  
**Цель документа:** сравнить текущую RBAC с целевой моделью permissions + store scope + подтверждение OWNER.  
**Не писать код до подтверждения.**

Связанные документы: `MANAGER-ROLE.md`, `MANAGER-CURRENT-VS-TARGET.md`, `MANAGER-PERMISSIONS-PLAN.md`, `rbac.md`, `SECURITY-VERIFICATION.md`.

**Неизменяемое правило проекта (зафиксировать):**

> Менеджер управляет **процессом**, но не **финансовым состоянием**.  
> Он может инициировать передачу / продажу / ревизию, но не может самовольно менять остаток, цену, себестоимость, расходы или финансовый результат.  
> UI hiding ≠ security boundary.

---

## 0. Краткий вердикт

| Вопрос | Ответ |
|--------|--------|
| Есть ли таблица/ключи permissions? | **Нет** — только `Role` + `User.storeId` |
| OWNER настраивает права MANAGER? | **Нет** |
| Multi-store scope? | **Нет** — один `storeId` |
| Finance / COGS закрыты для MANAGER? | **Да** (M1 + `stripFinanceForRole`) — в целом соответствует |
| Точные остатки скрыты? | **Нет** — qty отдаются (`/api/stores/[id]/stock`, `/api/warehouse/stock`) |
| Передачи SENT→RECEIVED? | **Нет** — сразу `COMPLETED` |
| Ревизия двухэтапная? | **Частично** — lifecycle есть; create заблокирован M1 |
| Продажи MANAGER? | **Заблокированы** M1 (API `requireOwner` / `requireSeller`) |
| Создать SELLER / магазин? | **Нет** (только OWNER) |
| Можно расширить без rewrite auth? | **Да** — additive поверх `rbac.ts` + M1 |

**Вывод:** не переписывать auth. Добавить слой `permission + storeScope` поверх существующего role-gate. M1 hard-deny финансов/каталога сохранить как **never-grantable**.

---

## 1. Существующие «MANAGER permissions»

**Формальных permissions нет.** Есть только роль `MANAGER` и role-helpers:

| Helper / флаг | Файл | MANAGER |
|---------------|------|---------|
| `requireOwnerOrManager` | `src/lib/rbac.ts` | ✅ вход |
| `requireOwner` | то же | ❌ |
| `requireSeller` | то же | ❌ |
| `scopedStoreId` | то же | фильтр = `user.storeId` |
| `requireStoreAccess` | то же | 403 если `storeId ≠ user.storeId` |
| `canViewWarehouseFinance` | то же | ❌ |
| `canManageUsers` | то же | ❌ |
| `canWipeCompany` | то же | ❌ |
| `stripFinanceForRole` | `finance-visibility.ts` | scrub finance keys |
| Middleware blocklist | `middleware.ts` | UI paths |
| Nav filter | `owner-nav.ts` / `bottom-nav.tsx` | ops tabs |

**Итог:** «permission» сегодня = «роль MANAGER + один магазин». OWNER не может включить/выключить SALES / AUDITS / STORES_CREATE.

---

## 2. Существующие OWNER permissions

OWNER + ADMIN = **owner-class** (`isOwnerClass`):

| Область | Как |
|---------|-----|
| Все магазины | `scopedStoreId` → без фильтра |
| Финансы / analytics / dashboard / export / expenses | `requireOwner` |
| Каталог CRUD, цены, batches receive | `requireOwner` |
| Users CRUD (в т.ч. MANAGER/ADMIN) | `requireOwner` + `ASSIGNABLE_ROLES` |
| Wipe | только `Role.OWNER` |
| Approve revision | `requireOwner` на `APPROVE` |
| Settings system | OWNER |
| Direct POS discount | `canApplyDirectDiscount` |

ADMIN ≈ OWNER по финансам/API, кроме wipe. В ТЗ ADMIN не выделен — **не ломать**.

---

## 3. Существующие SELLER permissions

| Область | Как |
|---------|-----|
| Scope | `user.storeId` + проверки в `sale.service` |
| POS | `/pos`; middleware режет owner-area |
| Sales GET/POST | `requireSeller` |
| Reservations | seller + sync |
| Discount request create | seller path |
| Confirm transfer receive | **нет** (передачи мгновенные) |
| Create users / stores | нет |

---

## 4. Существующие store-scoped проверки

| Механизм | Поведение |
|----------|-----------|
| `User.storeId` | один FK; для MANAGER = единственный scope |
| `requireStoreAccess(user, storeId)` | только если `role === MANAGER` |
| `scopedStoreId` | MANAGER → `storeId`; OWNER → `undefined` (все) |
| Список магазинов | `stores-list.service` — MANAGER видит только assigned |
| OWNER_DIRECT | обычный `Store` с `kind=OWNER_DIRECT`; отдельного ACL нет |

**Нет:** `allowedStores[]`, `ALL_STORES` / `SELECTED_STORES`, per-store permission matrix.

**Риск:** MANAGER с `storeId=null` → scope `__none__` / 403 на чужие id (жёстко), но multi-store невозможен.

---

## 5. Существующие API authorization checks

Паттерн почти везде:

```text
getSessionUser → requireOwner | requireOwnerOrManager | requireSeller
→ (иногда) requireStoreAccess
→ (часто) stripFinanceForRole
```

**Нет** `requirePermission(key)`.

Уровни:

1. **Role gate** — основной  
2. **Store scope** — только MANAGER single-store  
3. **Field scrub** — finance  
4. **Middleware** — UI (не API)

---

## 6. Какие endpoint'ы сейчас доступны MANAGER

### 6.1 Разрешены (`requireOwnerOrManager` или эквивалент)

| Endpoint | Методы | Scope | Заметки vs TZ |
|----------|--------|-------|----------------|
| `/api/stores` | GET, PATCH* | single | *часть PATCH — owner-only |
| `/api/stores/[id]` | GET | yes | деталь + scrub finance |
| `/api/stores/[id]/stock` | GET | yes | **точные qty** ❌ vs TZ |
| `/api/stores/[id]/staff` | GET | yes; mutate owner | |
| `/api/stores/[id]/revisions` | GET | yes | |
| `/api/stores/[id]/returns` | GET | yes | UI blocked M1 |
| `/api/stores/[id]/discounts` | GET | yes | UI blocked |
| `/api/stores/[id]/requests` | GET | yes | |
| `/api/transfers` | GET, POST | dest/src | **мгновенный COMPLETED**; cost в item |
| `/api/warehouse/return-in` | GET, POST | OOM | обратная передача |
| `/api/warehouse/stock` | GET | company WH | **точные qty склада** ❌ |
| `/api/warehouses` | GET | — | список WH |
| `/api/revisions` | GET, PATCH | yes | POST create = **Owner** |
| `/api/products` GET | OOM | — | каталог read |
| `/api/products/[id]` GET | OOM | — | |
| `/api/brands|categories` GET | OOM | — | |
| `/api/packaging-skus` GET | OOM | — | |
| `/api/pos/packaging-bottles` | OOM | — | |
| `/api/company` GET | OOM | — | |
| `/api/notifications` | own | — | |
| `/api/reservations` | OOM | — | UI blocked |
| `/api/discount-requests` | OOM (часть) | — | UI blocked |
| `/api/returns` | OOM list | — | UI blocked |
| `/api/units` POST/PATCH | **OOM** | — | **противоречит TZ** (каталог) |
| `/api/product-types` POST/PATCH | **OOM** | — | **противоречит** |
| `/api/operation-types` POST/PATCH | **OOM** | — | **противоречит** |

### 6.2 Закрыты OWNER (M1 / всегда)

dashboard, analytics, export, expenses, expense-types, journal, suppliers, batches, price, write-offs, overview, purchases, history, stock-breakdown, stores create/delete, users CRUD, sales (non-seller), stores/[id]/sales, initial-stock, gift-rules, wipe, low-stock thresholds settings, revision **POST create**, packaging mutations, brands/categories mutations.

### 6.3 SELLER-only / Owner sales

`/api/sales` — MANAGER **не** может GET/POST (после M1).

---

## 7. Что противоречит этому ТЗ

| # | ТЗ | Сейчас | Severity |
|---|-----|--------|----------|
| A | Granular permissions OWNER→MANAGER | Role-only | **High** (архитектура) |
| B | UI + API + Action на каждый key | Только role + middleware | **High** |
| C | Multi-store `allowedStores` | Один `storeId` | **High** |
| D | Не видеть точные остатки (bands/alerts) | Exact qty в stock APIs | **High** |
| E | Не управлять складом, только transfer process | WH stock GET + return-in; transfer OK | **Med** |
| F | Transfers `DRAFT/SENT/RECEIVED/DISCREPANCY` | `PENDING/COMPLETED/CANCELLED`, create→COMPLETED | **High** (M3) |
| G | SELLER confirms receive | Нет | **High** (M3) |
| H | MANAGER не стирает discrepancy | N/A (нет статуса) | — |
| I | `SALES_CREATE` grantable | Sales полностью закрыты | **Med** (policy choice) |
| J | `AUDITS_CREATE` для MANAGER | POST create = Owner; PATCH submit если сессия есть | **Med** |
| K | `SELLERS_CREATE/ASSIGN` | Owner only | **Med** (M2) |
| L | `STORES_CREATE` ops-only | Owner only | **Med** (M2) |
| M | Never direct `PATCH stock` | Нет публичного stock patch — OK | OK |
| N | Typed notifications (LOW/OUT/TRANSFER/AUDIT) | `LOW_STOCK`, `TRANSFER_DONE`, `INVENTORY_DONE`… | **Low–Med** |
| O | Audit log MANAGER actions | `ActivityLog` есть; покрытие неполное | **Low** |
| P | Residual catalog mutations OOM | units / product-types / operation-types | **Med** (закрыть как M1 gap) |
| Q | Transfer POST без strip finance | возможен leak `costPerUnit` | **Med** |
| R | Settings hub виден MANAGER | company/profile/security/notifications | **Low** (ок профиль; company — спорно) |
| S | Store card ops-only | list scrubbing finance; stock qty всё ещё | **Med** |
| T | MANAGER не меняет own permissions | N/A (нет таблицы) | — |

Совпадает уже хорошо:

- Finance / COGS / expenses / analytics → Owner  
- Product create/edit/price/receive → Owner  
- Revision approve → Owner  
- Blind revision detail для non-owner после submit  
- `stripFinanceForRole`  
- Users: MANAGER не создаёт никого  
- ActivityLog модель готова к расширению  

---

## 8. Какие Prisma-модели уже можно использовать

| Модель | Пригодно для |
|--------|----------------|
| `User` + `Role` + `storeId` | роль; legacy primary store |
| `Store` + `StoreKind.OWNER_DIRECT` | scope incl. owner store |
| `Transfer` / `TransferItem` | расширить статусы (миграция) |
| `InventorySession` / `InventoryItem` | `IN_PROGRESS → PENDING_APPROVAL → COMPLETED`; `createdBy` / `approvedBy` |
| `Notification` + `NotificationType` | расширить enum при необходимости |
| `ActivityLog` | MANAGER_ACTION journal |
| `Setting` | опционально defaults; лучше отдельные таблицы |

**Нет моделей:** Permission, UserPermission, ManagerStoreAccess.

---

## 9. Какие изменения действительно необходимы

### 9.1 Обязательные (permissions foundation) — без rewrite auth

1. **Additive Prisma** (минимально):
   - `ManagerPermission(userId, key, enabled)`  
   - `ManagerStoreAccess(userId, storeId)`  
   - опционально `User.managerScope`: `LEGACY_SINGLE | ALL | SELECTED`  
2. **`requirePermission(user, key)`** + **`assertStoreInScope(user, storeId)`** в `rbac.ts` (OWNER bypass always).  
3. **Hard-deny registry** (нельзя сохранить/выдать): finance, cost, price edit, catalog CRUD, receive, wipe, create OWNER/MANAGER, `AUDITS_APPROVE`.  
4. **Defaults** = безопасный M1 + ТЗ ops (см. §11).  
5. Закрыть residual OOM mutations: `units` / `product-types` / `operation-types` → `requireOwner`.  
6. Stock DTO для MANAGER: bands / flags, не qty (если нет `STOCK_VIEW_EXACT`).  
7. `stripFinanceForRole` на transfer create response.

### 9.2 Отдельные этапы (не в одном PR)

| Этап | Содержание | Миграция? |
|------|------------|-----------|
| P1 | Permission tables + server checks + defaults | **да** additive |
| P2 | OWNER UI «Права менеджера» + scope магазинов | нет |
| P3 | Stock bands + notification copy без чисел | нет / мелкие DTO |
| P4 = M2 | SELLERS_* + STORES_CREATE | нет |
| P5 | AUDITS_* reopen create для MANAGER + alignment middleware | нет |
| P6 = M3 | Transfer statuses SENT/RECEIVED/DISCREPANCY + SELLER confirm | **да** enum |
| P7 | SALES_* если OWNER включил | нет |
| P8 = M4 | Ops shell / notifications typing | возможно enum |

### 9.3 Не делать

- Вторая параллельная RBAC  
- Переписывать Auth.js / sale FIFO / COGS engine  
- Менять OWNER capabilities  
- Десять ролей `MANAGER_*`  
- Ломать существующие security fixes  
- Мгновенно менять stock accounting при discrepancy без OWNER  

### 9.4 Риски обратной совместимости

| Риск | Митигация |
|------|-----------|
| Существующие MANAGER с одним `storeId` | `LEGACY_SINGLE` = текущее поведение; seed permissions = defaults |
| Transfer COMPLETED в истории | M3: новые статусы; старые COMPLETED = «уже получено» |
| UI ждал exact qty | bands + CTA transfer |
| OWNER выдал «всё» | hard deny list |
| Nav/API drift | один `hasPermission` для nav + middleware + API |

---

## 10. Маппинг ключей ТЗ → предложение реализации

ТЗ использует `SALES_VIEW`. Ранее в плане были `sales.view`. **Рекомендация:** один канон в коде — `SCREAMING_SNAKE` как в этом ТЗ (или dot — но не оба).

| TZ key | Default MANAGER | Hard deny? | Есть сейчас? |
|--------|----------------:|:----------:|:------------:|
| `SALES_VIEW` | ✅ (по последнему ТЗ) / было ❌ в M1 | no | нет (sales closed) |
| `SALES_CREATE` | ✅ / было ❌ M1 | no | нет |
| `STORES_VIEW` | ✅ | no | de-facto role |
| `STORES_CREATE` | ❌ grantable | no | Owner only |
| `TRANSFERS_VIEW` | ✅ | no | de-facto |
| `TRANSFERS_CREATE` | ✅ | no | de-facto |
| `TRANSFERS_CANCEL` | ❌/grantable | no | слабо |
| `AUDITS_VIEW` | ✅ | no | GET list |
| `AUDITS_CREATE` | ✅ | no | POST Owner |
| `AUDITS_COMPLETE` (= submit) | ✅ | no | PATCH SUBMIT |
| `AUDITS_APPROVE` | — | **YES** | Owner only |
| `NOTIFICATIONS_VIEW` | ✅ | no | yes |
| `SELLERS_VIEW` | ❌→grant | no | GET staff |
| `SELLERS_CREATE` | ❌→grant | no | no |
| `SELLERS_ASSIGN` | ❌→grant | no | Owner |
| `STOCK_VIEW_EXACT` | ❌ | optional rare | qty open today |
| `FINANCE_*` / `COST_*` / `PRICE_EDIT` | — | **YES** | Owner |

**Политика defaults — согласовать:** последнее сообщение говорит «Продажи ✅», M1 и предыдущий план — «продажи выкл.». Аудит рекомендует: **grantable, default OFF** до явного включения OWNER (безопаснее), либо default ON если бизнес так решил.

---

## 11. Предлагаемые defaults (безопасный старт)

```text
STORES_VIEW ✅
TRANSFERS_VIEW ✅  TRANSFERS_CREATE ✅
NOTIFICATIONS_VIEW ✅  (low/out/transfer ops)
AUDITS_VIEW ✅  AUDITS_CREATE ❌ до P5 (сейчас create Owner)
SALES_* ❌ до явного grant
SELLERS_* ❌
STORES_CREATE ❌
STOCK_VIEW_EXACT ❌
```

Scope default: **LEGACY_SINGLE** (`User.storeId`).

---

## 12. Security verification checklist (после реализации)

Прямой HTTP от MANAGER:

- [ ] exact stock без `STOCK_VIEW_EXACT`  
- [ ] COGS / profit / expenses / analytics  
- [ ] price / cost / product create  
- [ ] stock adjust / receive  
- [ ] store вне allowedStores  
- [ ] create MANAGER / OWNER  
- [ ] approve own audit  
- [ ] mutate APPROVED audit  
- [ ] erase DISCREPANCY  
- [ ] finance fields в transfer/sale JSON  

Все → 403 или scrubbed empty.

---

## 13. Ответы на 9 пунктов ТЗ (сводка)

1. **MANAGER permissions:** нет ключей; role + M1 blocklist.  
2. **OWNER:** owner-class полный доступ.  
3. **SELLER:** POS + свой store.  
4. **Store-scope:** `requireStoreAccess` / single `storeId`.  
5. **API checks:** role helpers + scrub; нет permission keys.  
6. **MANAGER endpoints:** §6.  
7. **Противоречия:** §7.  
8. **Prisma reuse:** User/Store/Transfer/InventorySession/Notification/ActivityLog.  
9. **Необходимые изменения:** §9 (additive permissions → stock bands → M2 → M3).

---

## 14. Вопросы к вам перед кодом

1. **Defaults продаж:** `SALES_VIEW/CREATE` по умолчанию **вкл** (как в этом ТЗ) или **выкл** (безопаснее / M1)?  
2. **`STOCK_VIEW_EXACT`:** никогда, или редкая галочка OWNER?  
3. **P1 сразу с миграцией** `ManagerPermission` + `ManagerStoreAccess` — ОК?  
4. Имена ключей: **`SALES_VIEW`** (этот документ) vs `sales.view` (старый план) — какой канон?  
5. Закрыть residual `units`/`product-types`/`operation-types` mutations в том же P1?

**Код не пишу до подтверждения.**
