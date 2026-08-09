# Aramat Plus — MANAGER MASTER SPECIFICATION

## Единая спецификация роли MANAGER, OWNER-настроек и операционного управления

**Статус:** MASTER SPECIFICATION — **единственный source of truth**
**Проект:** Aramat Plus
**Назначение:** единый источник правды для реализации MANAGER
**Главное требование:** additive implementation — не переписывать существующую архитектуру без необходимости.

**R1 boundaries:** sales.view / sales.create = **DEFAULT OFF** (только явный grant OWNER). Вне R1: **M2** sellers.create/assign wire, **M3** SENT/RECEIVED/DISCREPANCY, **M4** Manager dashboard, **R5** inventory.audit.create POST reopen.

---

# 1. Главная цель

В Aramat Plus должна появиться полноценная операционная роль `MANAGER`.

MANAGER не является вторым OWNER.

MANAGER не должен получать полный доступ к бизнесу.

Его задача:

* управлять назначенными магазинами;
* работать с продавцами в пределах разрешений;
* создавать/просматривать операционные передачи;
* получать операционные уведомления;
* при необходимости создавать продажи, если OWNER явно разрешил `sales.create`;
* выполнять разрешённые операции ревизии;
* работать только с теми магазинами, которые входят в его scope.

При этом MANAGER не получает финансовый контроль.

Основной принцип:

```text
OWNER
  ↓
определяет права и область работы MANAGER
  ↓
MANAGER
  ↓
управляет операционными процессами
  ↓
SELLER
  ↓
работает с конкретным магазином и продажами
```

---

# 2. Источник правды

Создать:

```text
docs/MANAGER-MASTER-SPEC.md
```

Этот документ является **единственным master-документом** по MANAGER.

Следующие документы не должны содержать противоречащих правил:

```text
docs/MANAGER-PERMISSIONS-SPEC.md
docs/MANAGER-ROLE.md
docs/MANAGER-CURRENT-VS-TARGET.md
docs/MANAGER-PERMISSIONS-R1-PLAN.md
docs/MANAGER-PERMISSIONS-R1-GATE.md
docs/rbac.md
```

Они должны ссылаться на MASTER SPEC и содержать только краткое резюме.

Нельзя создавать несколько конкурирующих моделей MANAGER.

---

# 3. Архитектурная модель

MANAGER определяется не только ролью.

Используется:

```text
ROLE
+
PERMISSIONS
+
SCOPE
```

То есть:

```text
MANAGER
    │
    ├── permissions
    │
    └── store scope
```

Роль отвечает на вопрос:

> Кто это?

Permission отвечает:

> Что ему разрешено делать?

Scope отвечает:

> С какими магазинами ему разрешено работать?

---

# 4. Не создавать новый параллельный RBAC

В проекте уже существует:

```text
src/lib/rbac.ts
```

Нельзя создавать второй независимый RBAC.

Нужно расширить существующий authorization layer.

Желаемая архитектура:

```text
Request
   ↓
Existing Auth.js session
   ↓
Existing role/auth checks
   ↓
MANAGER?
   ↓
hasPermission()
   ↓
assertStoreInScope()
   ↓
existing business logic
   ↓
DTO / response scrub
```

OWNER должен продолжить работать как раньше.

SELLER должен продолжить работать как раньше.

Существующая авторизация не должна быть переписана целиком.

---

# 5. OWNER остаётся OWNER

Новая система MANAGER не должна отбирать права у OWNER.

OWNER сохраняет полный доступ:

* товары;
* каталог;
* центральный склад;
* магазины;
* продажи;
* цены;
* себестоимость;
* COGS;
* прибыль;
* расходы;
* финансовая аналитика;
* пользователи;
* MANAGER;
* SELLER;
* настройки;
* ревизии;
* складские операции;
* системные операции.

OWNER bypass должен продолжить работать.

---

# 6. MANAGER — операционная роль

MANAGER предназначен для операционного управления.

Основные направления:

```text
Магазины
Продавцы
Передачи
Операционные уведомления
Продажи — только если OWNER разрешил
Ревизии — только в разрешённом lifecycle
```

MANAGER не должен превращаться в:

```text
OWNER-lite
```

или:

```text
OWNER с выключенными несколькими меню
```

Это принципиально.

---

# 7. Где OWNER управляет правами MANAGER

Настройки MANAGER должны находиться **в существующем разделе пользователей**, а не в разделе магазинов.

Основной путь:

```text
/users
```

Файл:

```text
src/app/(owner)/users/page.tsx
```

Существующая навигация:

```text
team → /users
```

не должна заменяться.

---

# 8. UI OWNER: Пользователи

OWNER открывает:

```text
Пользователи
```

Там отображаются пользователи системы.

Например:

```text
Пользователи

OWNER
Nabot

MANAGER
Nasuh

MANAGER
Ali

SELLER
Rustam

SELLER
Farid
```

Для MANAGER должна появиться возможность:

```text
[Права]
```

или:

```text
[Управление]
```

---

# 9. Страница настройки конкретного MANAGER

Рекомендуемый путь:

```text
/users/managers/[userId]/permissions
```

Например:

```text
/users/managers/123/permissions
```

Это не отдельное приложение.

Это часть существующего OWNER → Users workflow.

---

# 10. Страница OWNER → MANAGER

Страница должна содержать:

```text
Настройки менеджера

Nasuh
MANAGER

────────────────────────

Права

Магазины
Продажи
Передачи
Продавцы
Ревизии
Уведомления

────────────────────────

Магазины

○ Все магазины
○ Выбранные магазины

[список магазинов]

────────────────────────

[Сохранить права]
```

---

# 11. Разделение Permissions и Scope

Очень важно не смешивать:

```text
Permission
```

и:

```text
Scope
```

Например:

```text
stores.view = true
```

означает:

> MANAGER имеет право видеть магазины.

Но это ещё не означает:

> MANAGER имеет право видеть все магазины.

Для этого нужен scope.

---

# 12. Scope MANAGER

Поддержать:

```text
LEGACY_SINGLE
ALL_STORES
SELECTED_STORES
```

### LEGACY_SINGLE

Используется для обратной совместимости со старой моделью:

```text
User.storeId
```

Это нельзя ломать.

### ALL_STORES

MANAGER работает со всеми доступными магазинами.

### SELECTED_STORES

OWNER выбирает конкретные магазины.

Например:

```text
☑ Магазин №1
☑ Магазин №2
☐ Магазин №3
☑ Магазин OWNER
☐ Магазин №5
```

---

# 13. OWNER_DIRECT

Если существующая модель различает магазин OWNER, он должен отображаться в scope явно.

Например:

```text
☑ Магазин OWNER
```

Но доступ к магазину OWNER не означает финансовый доступ.

Это только:

```text
store operational access
```

а не:

```text
finance access
```

---

# 14. Permission keys

Использовать dot notation.

Например:

```text
stores.view
stores.create
stores.edit

stores.stock.bands

transfers.view
transfers.create

sellers.view
sellers.create
sellers.assign

sales.view
sales.create

inventory.audit.view
inventory.audit.create
inventory.audit.approve

notifications.low_stock
notifications.out_of_stock
notifications.transfers
notifications.discrepancy
notifications.audit
```

Нельзя создавать разные форматы одновременно:

```text
sales_create
SALES_CREATE
canCreateSales
```

Использовать единый формат:

```text
sales.create
```

---

# 15. Permission groups в OWNER UI

UI должен группировать permissions по смыслу.

## Магазины

```text
☑ Просматривать магазины
☐ Создавать магазины
☐ Редактировать магазины
☑ Видеть состояние остатков
```

## Продажи

```text
☐ Просматривать продажи
☐ Создавать продажи
☐ Редактировать продажи
☐ Отменять продажи
☐ Возвращать продажи
```

В R1 `sales.*` по умолчанию выключены.

## Передачи

```text
☑ Просматривать передачи
☑ Создавать передачи
```

Lifecycle `SENT → RECEIVED → DISCREPANCY` относится к M3 и сейчас не переписывается.

## Продавцы

В R1:

```text
☐ Просматривать продавцов
☐ Создавать продавцов
☐ Назначать продавцов
```

Полная реализация M2.

## Ревизии

```text
☑ Просматривать ревизии
☑ Создавать/начинать разрешённую операцию ревизии
☐ Подтверждать ревизию
```

`inventory.audit.approve` является OWNER-only.

## Уведомления

```text
☑ Низкий остаток
☑ Товар закончился
☑ Передачи
☑ Расхождения
☑ Ревизии
```

---

# 16. Никогда не выдаваемые MANAGER permissions

Следующие permissions нельзя выдавать MANAGER даже через OWNER UI:

```text
finance.view
finance.manage

cogs.view

prices.view
prices.edit

products.create
products.edit
products.delete

stock.adjust
stock.view.exact

inventory.audit.approve

owner.manage

system.settings
```

Также любые будущие permission keys, которые дают системный или полный финансовый контроль, должны попадать в `NEVER_GRANTABLE`.

---

# 17. Важнейшее правило безопасности

OWNER UI не должен быть способом случайно превратить MANAGER в OWNER.

Даже если OWNER ошибочно пытается включить запрещённое permission, backend обязан отклонить его.

Например:

```http
PUT /api/managers/123/permissions
```

с:

```json
{
  "permissions": [
    "finance.view"
  ]
}
```

должно завершиться отказом.

Нельзя рассчитывать только на disabled checkbox.

Backend является источником безопасности.

---

# 18. Data model

Добавить аддитивно:

```text
ManagerPermission
ManagerStoreAccess
User.managerScopeMode
```

Например концептуально:

```text
User
 ├── role
 ├── storeId
 └── managerScopeMode

ManagerPermission
 ├── userId
 ├── key
 └── enabled

ManagerStoreAccess
 ├── managerId
 └── storeId
```

Точные поля должны соответствовать существующей Prisma архитектуре.

Не переписывать User целиком.

---

# 19. Backward compatibility

Существующие MANAGER уже могут иметь:

```text
User.storeId
```

После миграции они не должны потерять доступ.

Для существующих MANAGER:

```text
managerScopeMode = LEGACY_SINGLE
```

и существующий `storeId` используется как scope.

Таким образом:

```text
старый MANAGER
       ↓
LEGACY_SINGLE
       ↓
старый storeId
```

После OWNER может перевести его на:

```text
ALL_STORES
```

или:

```text
SELECTED_STORES
```

---

# 20. Permissions API

Нужны:

```http
GET /api/me/permissions
```

и:

```http
GET /api/managers/[userId]/permissions
PUT /api/managers/[userId]/permissions
```

---

# 21. GET /api/me/permissions

MANAGER должен получить информацию, необходимую frontend для построения своего интерфейса.

Например концептуально:

```json
{
  "role": "MANAGER",
  "permissions": {
    "stores.view": true,
    "transfers.view": true,
    "transfers.create": true,
    "sales.view": false,
    "sales.create": false
  },
  "scope": {
    "mode": "SELECTED_STORES",
    "storeIds": ["1", "3", "7"]
  }
}
```

Не возвращать через этот endpoint финансовые данные.

---

# 22. PUT permissions

Только OWNER может менять permissions MANAGER.

Проверка:

```text
session
 ↓
OWNER?
 ↓
target user exists?
 ↓
target role MANAGER?
 ↓
validate keys
 ↓
reject NEVER_GRANTABLE
 ↓
save
 ↓
ActivityLog
```

---

# 23. Audit изменения прав

Каждое изменение permissions должно записываться.

Например:

```text
ActivityLog

OWNER changed MANAGER permissions

Manager:
Nasuh

Changed:
sales.create OFF → ON

Scope:
SELECTED_STORES

Stores:
1, 3, 5

Timestamp:
...
```

Историю нельзя молча переписывать.

---

# 24. MANAGER: финансовая изоляция

MANAGER не должен получать:

```text
profit
COGS
cost
costPerUnit
purchasePrice
margin
expenses
stockCost
financial analytics
```

Даже если UI их не показывает.

Backend должен исключать эти поля из DTO либо блокировать endpoint.

---

# 25. Точные остатки

MANAGER не должен видеть точное количество товара в магазине.

Не:

```text
Dior Sauvage
7 шт.
```

А:

```text
NORMAL
LOW
VERY_LOW
OUT_OF_STOCK
```

Использовать:

```text
OUT_OF_STOCK
VERY_LOW
LOW
NORMAL
```

---

# 26. Stock bands

Создать:

```text
src/lib/permissions/stock-bands.ts
```

Он должен использовать существующие бизнес-пороговые значения.

Не придумывать отдельную вторую систему thresholds.

Например концептуально:

```text
quantity = 0
→ OUT_OF_STOCK

quantity <= veryLowThreshold
→ VERY_LOW

quantity <= lowThreshold
→ LOW

otherwise
→ NORMAL
```

Точные существующие thresholds нужно определить из текущего проекта.

---

# 27. Stock API

Для MANAGER:

```http
GET /api/stores/[id]/stock
```

должен возвращать operational band, но не numeric quantity.

Например:

```json
{
  "productId": "...",
  "productName": "Dior Sauvage",
  "stockStatus": "LOW"
}
```

Не:

```json
{
  "quantity": 7
}
```

---

# 28. OWNER и SELLER не ломать

OWNER продолжает получать существующие данные.

SELLER продолжает работать по существующей модели.

Stock band restriction применяется только к MANAGER.

---

# 29. Центральный склад

MANAGER не должен получать полноценный warehouse stock API.

Например:

```http
GET /api/warehouse/stock
```

для MANAGER:

```text
403 Forbidden
```

MANAGER не должен иметь возможность исследовать центральный склад как OWNER.

---

# 30. MANAGER и магазины

MANAGER может работать только с магазинами:

```text
assertStoreInScope(storeId)
```

Например:

```text
MANAGER
scope = [1, 3, 7]
```

Запрос:

```text
/store/1
```

→ разрешён.

Запрос:

```text
/store/5
```

→ `403`.

Нельзя надеяться только на скрытие магазина в UI.

---

# 31. stores API

Существующие:

```text
/api/stores
/api/stores/[id]
```

должны учитывать:

```text
stores.view
```

и:

```text
assertStoreInScope()
```

для MANAGER.

OWNER получает существующий полный результат.

---

# 32. MANAGER UI

До полноценного M4 не создавать новый огромный dashboard.

R1 должен использовать существующий shell.

Но frontend должен динамически показывать только разрешённые пункты.

Например:

```text
Магазины
Передачи
Уведомления
```

Если:

```text
sales.create = true
```

можно показать соответствующий sales action.

Если:

```text
sales.create = false
```

не показывать возможность создания продажи.

Однако:

> UI visibility не является security.

Server-side authorization обязателен.

---

# 33. MANAGER Dashboard

Полный операционный dashboard:

```text
Manager Dashboard
├── Магазины
├── Передачи
├── Низкие остатки
├── Продавцы
└── Уведомления
```

относится к M4.

В R1 не нужно переписывать существующий dashboard.

---

# 34. MANAGER и продажи

По умолчанию:

```text
sales.view = OFF
sales.create = OFF
```

Это обязательное решение.

Нельзя автоматически включать продажи только потому, что пользователь MANAGER.

Если OWNER явно включил:

```text
sales.create
```

и магазин находится в scope:

```text
POST /api/sales
```

может использовать существующий sale flow.

---

# 35. Не переписывать продажи

При разрешении `sales.create` использовать существующий:

```text
createSale()
```

и существующий inventory/FIFO/COGS engine.

Не создавать новый MANAGER sale engine.

Не переписывать:

```text
sale.service
```

только ради MANAGER.

---

# 36. Финансовая информация в sales response

Даже если MANAGER получил:

```text
sales.create
```

response должен быть очищен от финансовых полей.

MANAGER не должен внезапно получить:

```text
COGS
profit
margin
cost
```

через response продажи.

---

# 37. Продажи: отдельные permissions

Не объединять:

```text
sales.create
sales.view
sales.edit
sales.cancel
sales.refund
```

в одно permission.

Это разные возможности.

R1:

```text
sales.view = OFF
sales.create = OFF
```

и OWNER может явно включить разрешённые permissions, если они входят в grantable set.

---

# 38. Передачи

В текущей системе передачи могут работать как:

```text
COMPLETED
```

Это не нужно ломать в R1.

R1 только добавляет:

```text
transfers.view
transfers.create
```

и соответствующую authorization.

---

# 39. M3 transfer lifecycle

Следующая полноценная модель:

```text
DRAFT
 ↓
SENT
 ↓
RECEIVED
```

и:

```text
SENT
 ↓
DISCREPANCY
```

будет реализована позже.

Она должна обеспечивать:

```text
MANAGER
    ↓
отправил
    ↓
SELLER
    ↓
физически получил
    ↓
подтвердил
```

Но это **M3**, не R1.

Не переписывать `transfer.service` сейчас.

---

# 40. SELLER

SELLER остаётся работником магазина.

SELLER должен видеть только разрешённый ему магазин и его операционные данные.

SELLER:

```text
продаёт товар
получает передачи
подтверждает получение
работает с магазином
```

---

# 41. SELLER не получает MANAGER permissions

Добавление MANAGER permissions не должно автоматически менять SELLER.

SELLER продолжает использовать существующий seller authorization path.

---

# 42. M2: управление SELLER

Полная функциональность:

```text
sellers.create
sellers.assign
```

**Статус:** M2 sellers wire = **COMPLETE** (см. `MANAGER-PERMISSIONS-M2-SPEC.md`).  
`stores.create` **не** входит в этот M2 — см. §43 / DEFERRED.

MANAGER сможет:

```text
создать SELLER
назначить SELLER магазину
```

только в пределах своего scope.

Например:

```text
MANAGER scope:
Store 1
Store 3

```

Он не может назначить SELLER:

```text
Store 8
```

если Store 8 не входит в его scope.

---

# 43. Создание магазина

`stores.create` в R1 по умолчанию:

```text
OFF
```

Полная реализация MANAGER → create store = **DEFERRED** (отдельный slice после M2 sellers; не смешивать с M2 COMPLETE).

Даже когда permission будет реализован:

MANAGER сможет создавать магазин только в рамках предусмотренной бизнес-логики и не получит финансовые настройки магазина.

---

# 44. Ревизия

Ревизия должна быть отдельной операцией.

MANAGER не получает:

```text
inventory.audit.approve
```

никогда.

MANAGER может работать с разрешённой частью ревизии.

---

# 45. Ревизия: lifecycle

Целевая модель:

```text
DRAFT
   ↓
IN_PROGRESS
   ↓
SUBMITTED
   ↓
APPROVED
```

или:

```text
SUBMITTED
   ↓
REJECTED
```

MANAGER:

```text
create/start
perform
submit
```

OWNER:

```text
approve
reject
```

---

# 46. Результат ревизии

До подтверждения OWNER:

```text
окончательный складской учёт
```

не должен изменяться автоматически, если существующая бизнес-логика не предусматривает иное.

MANAGER не может сам утвердить свою ревизию.

---

# 47. Финансовая сторона ревизии

MANAGER не должен получать:

```text
стоимость расхождения
COGS impact
financial loss
```

если для этого нет отдельного разрешения.

Но:

```text
inventory.audit.approve
```

всё равно OWNER-only.

---

# 48. Уведомления MANAGER

MANAGER должен получать операционные уведомления:

```text
LOW_STOCK
OUT_OF_STOCK
TRANSFER
DISCREPANCY
AUDIT
```

Например:

```text
⚠️ Низкий остаток

Магазин №3

Dior Sauvage

Товар требует внимания.
```

Не обязательно показывать:

```text
7 шт.
```

если exact stock запрещён.

---

# 49. MANAGER не получает финансовые notifications

Например OWNER может получать:

```text
Profit
COGS
Expense
Financial alert
```

MANAGER этого не получает.

---

# 50. Navigation

Frontend должен строить доступные элементы на основании:

```text
/api/me/permissions
```

или единого серверного permission state.

Но frontend не должен считаться authorization layer.

---

# 51. UI permission groups

Создать централизованное описание ключей:

```text
src/lib/permissions/keys.ts
```

В нём должны находиться:

```text
PERMISSION_KEYS
DEFAULT_MANAGER_PERMISSIONS
NEVER_GRANTABLE
UI_GROUPS
```

Это предотвращает разброс строк:

```text
"sales.create"
```

по десяткам файлов.

---

# 52. Permission helper

Создать:

```text
src/lib/permissions/manager-permissions.ts
```

Он отвечает за:

```text
load permissions
hasPermission
requirePermission
scope resolution
assertStoreInScope
save permissions
```

Но существующий `rbac.ts` должен оставаться входной точкой/тонкой обёрткой там, где это нужно для совместимости.

---

# 53. Единственный authorization path

Не должно существовать:

```text
rbac.ts
+
manager-rbac.ts
+
permissions.ts
+
special-manager-auth.ts
```

с разными правилами.

Должен существовать единый путь.

Концептуально:

```text
requirePermission()
        ↓
role
        ↓
permission
        ↓
scope
        ↓
business logic
```

---

# 54. API: catalog

MANAGER не должен создавать или редактировать каталог.

Например:

```text
POST /api/products
PATCH /api/products/:id
```

→ `403`.

Также:

```text
brands mutations
categories mutations
suppliers mutations
units mutations
product-types mutations
operation-types mutations
```

должны оставаться OWNER-only там, где это соответствует текущей архитектуре.

---

# 55. Stock adjustment

MANAGER не должен иметь:

```text
stock.adjust
```

и не должен иметь возможность отправить напрямую:

```text
+10
-5
set quantity = 100
```

через API.

Такой запрос:

```text
403 Forbidden
```

---

# 56. Prices

MANAGER не может:

```text
view exact purchase cost
edit price
edit purchase price
edit cost
edit margin
```

---

# 57. Finance

MANAGER не может:

```text
view finance
view expenses
create expense
edit expense
delete expense
view COGS
view profit
```

---

# 58. Warehouse

MANAGER не должен получать центральный склад как полноценный inventory screen.

Warehouse stock API:

```text
MANAGER → 403
```

---

# 59. Response scrubbing

Недостаточно:

```text
if role === MANAGER:
    hide button
```

Нужно также:

```text
server response
 ↓
DTO
 ↓
remove sensitive fields
```

Особенно для:

```text
cost
COGS
profit
margin
expenses
exact stock
```

---

# 60. Security tests

После реализации обязательно проверить прямыми HTTP requests.

Проверить MANAGER:

```text
GET finance
GET COGS
GET costs
GET exact stock
GET warehouse stock

POST product
PATCH product
POST expense
PATCH expense
POST batch
PATCH price
POST stock adjustment

GET out-of-scope store

POST unauthorized sales
POST unauthorized audit approval
```

Все должны возвращать:

```text
403
```

или безопасный DTO, если endpoint специально поддерживает ограниченный MANAGER response.

---

# 61. Проверить разрешённые операции

Проверить:

```text
GET stores
GET in-scope store
GET operational stock
GET stock bands
GET transfers
POST transfer
GET permissions
```

Они должны работать только согласно permission + scope.

---

# 62. OWNER smoke test

После изменений проверить:

```text
OWNER login
OWNER dashboard
OWNER users
OWNER finance
OWNER sales
OWNER warehouse
OWNER catalog
OWNER products
OWNER settings
OWNER analytics
```

OWNER не должен потерять существующий доступ.

---

# 63. SELLER smoke test

Проверить:

```text
SELLER login
SELLER store
SELLER sales
SELLER inventory
SELLER existing flows
```

Новая MANAGER permission architecture не должна ломать SELLER.

---

# 64. Не трогать

Без необходимости не менять:

```text
Auth.js
sale.service
FIFO
COGS engine
transfer.service lifecycle
revision approval flow
Docker
CSRF
rate limiting
fingerprint/security
финансовые OWNER routes
```

Также:

```text
не удалять существующие API;
не удалять существующие модели;
не делать массовый refactor;
не менять unrelated components.
```

---

# 65. R1 Scope

R1 включает:

### Data

```text
ManagerPermission
ManagerStoreAccess
User.managerScopeMode
```

### Authorization

```text
hasPermission
requirePermission
assertStoreInScope
```

### Stock

```text
MANAGER → stock bands
MANAGER → no exact quantity
MANAGER → warehouse 403
```

### Sales

```text
sales.view = OFF
sales.create = OFF
```

Если OWNER явно разрешает поддерживаемое permission:

```text
existing sales flow
+
scope
+
server authorization
+
finance scrub
```

### OWNER UI

```text
/users
    ↓
MANAGER
    ↓
Права
    ↓
permissions + scope
```

### API

```text
GET /api/me/permissions
GET /api/managers/[userId]/permissions
PUT /api/managers/[userId]/permissions
```

---

# 66. Не входит в R1

Не реализовывать сейчас:

```text
M2
полный seller create/assign wire

M3
SENT → RECEIVED → DISCREPANCY

M4
новый Manager Dashboard

R5
полный audit create/reopen flow
```

Также не нужно сейчас переписывать transfer lifecycle.

---

# 67. Последующие этапы

## M2

```text
MANAGER
 ↓
создание SELLER
 ↓
назначение SELLER
 ↓
магазин
```

с обязательной проверкой scope.

---

## M3

Полный transfer lifecycle:

```text
CENTRAL STOCK
      ↓
MANAGER
      ↓
SENT
      ↓
SELLER
      ↓
RECEIVED
```

При расхождении:

```text
SENT
 ↓
DISCREPANCY
```

SELLER указывает фактически полученное количество.

MANAGER получает уведомление.

---

## M4

Полный отдельный Manager Dashboard:

```text
Manager Dashboard

├── Магазины
├── Передачи
├── Низкие остатки
├── Продавцы
└── Уведомления
```

Без финансов:

```text
profit
COGS
expenses
margin
```

---

# 68. Главное правило разработки

Не реализовывать MANAGER как новый самостоятельный application.

Нужно расширить существующий Aramat Plus:

```text
CURRENT SYSTEM
      +
permissions
      +
scope
      +
OWNER configuration UI
      +
server authorization
      +
safe DTOs
```

а не:

```text
CURRENT SYSTEM
      ↓
rewrite
      ↓
new RBAC
      ↓
new inventory
      ↓
new sales
```

---

# 69. Правило минимального изменения

Перед изменением каждого файла задать вопрос:

> Можно ли реализовать требование с минимальным additive change?

Если да — использовать additive change.

Если нет — сначала определить:

```text
какая существующая архитектура мешает;
почему её необходимо изменить;
какой минимальный участок необходимо изменить.
```

Не делать refactor только ради красоты.

---

# 70. Перед кодированием

Cursor должен проверить существующий проект и составить:

```text
CURRENT
vs
TARGET
```

для:

```text
RBAC
Users
Stores
Stock
Transfers
Sales
Audit
Notifications
Finance
Catalog
```

Также определить:

```text
какие модели уже существуют;
какие services уже существуют;
какие permissions уже существуют;
какие endpoints уже существуют;
какие authorization helpers уже существуют.
```

Не создавать новую сущность, если существующую можно безопасно расширить.

---

# 71. Критическое правило для текущей системы

Текущая система уже содержит реализованные security fixes.

Они должны быть сохранены.

Не откатывать:

```text
M1 MANAGER restrictions
finance visibility fixes
existing RBAC restrictions
security middleware
```

Новая permission architecture должна расширять существующие ограничения, а не ослаблять их.

---

# 72. Definition of Done для R1

R1 считается завершённым только если:

### Backend

* permissions существуют;
* scope существует;
* существующие MANAGER получают backfill;
* OWNER может менять grantable permissions;
* NEVER_GRANTABLE отклоняются;
* permissions проверяются server-side;
* store scope проверяется server-side;
* exact stock скрыт;
* warehouse stock закрыт;
* finance закрыт;
* catalog writes закрыты;
* stock adjustment закрыт.

### Frontend

* OWNER видит MANAGER в `/users`;
* OWNER может открыть права MANAGER;
* OWNER может включить/выключить разрешённые permissions;
* OWNER может выбрать `ALL_STORES`;
* OWNER может выбрать `SELECTED_STORES`;
* запрещённые permissions отображаются как disabled/OWNER-only;
* MANAGER UI учитывает permissions;
* нет нового огромного dashboard в R1.

### Compatibility

* OWNER работает;
* SELLER работает;
* продажи не сломаны;
* FIFO не изменён;
* COGS не изменён;
* transfer engine не переписан;
* Auth.js не переписан;
* Docker не изменён.

### Verification

Обязательно:

```text
tsc
```

и документ:

```text
docs/MANAGER-PERMISSIONS-R1-VERIFY.md
```

с результатами security verification.

---

# 73. Финальная модель системы

```text
                         OWNER
                           │
             ┌─────────────┼─────────────┐
             │             │             │
          FINANCE       CATALOG       USERS
             │             │             │
          PRICES        PRODUCTS      MANAGERS
          COGS          WAREHOUSE     SELLERS
          PROFIT
          EXPENSES
             │
             ▼
          MANAGER
             │
      ┌──────┼─────────┐
      │      │         │
   STORES  TRANSFERS  SELLERS
      │      │         │
      │      │         │
      └──────┼─────────┘
             │
       permissions
             +
           scope
             │
             ▼
          SELLER
             │
        ┌────┴────┐
        │         │
      SALES    RECEIVE
        │         │
        ▼         ▼
    CUSTOMER  STORE STOCK
```

---

# 74. Короткое определение ролей

## OWNER

> Решает, что существует, сколько это стоит, кому что разрешено и имеет полный контроль бизнеса.

## MANAGER

> Выполняет разрешённые OWNER операционные задачи в пределах назначенных магазинов.

## SELLER

> Работает с конкретным магазином, продажами и получением товара.

---

# 75. Главный принцип всей реализации

Нужно получить:

```text
OWNER
    ↓
настраивает
    ↓
PERMISSIONS + STORE SCOPE
    ↓
MANAGER
    ↓
операционные действия
    ↓
SELLER
```

а не:

```text
OWNER
    ↓
MANAGER получает почти всё
    ↓
UI что-то скрывает
```

**UI никогда не является границей безопасности.**

Граница безопасности находится на сервере:

```text
AUTH
 ↓
ROLE
 ↓
PERMISSION
 ↓
SCOPE
 ↓
BUSINESS RULE
 ↓
DATABASE
```

Это является окончательной архитектурой MANAGER для Aramat Plus.

**Последовательность реализации (не смешивать этапы):**

```text
R1 → permissions + scope + OWNER UI + gates + stock bands + finance isolation + VERIFY
M2 → SELLER create/assign (**COMPLETE**; `stores.create` = DEFERRED)
M3 → SENT → RECEIVED → DISCREPANCY
M4 → Manager Dashboard
```

`sales.create` / `sales.view` = **DEFAULT OFF**. Роль `MANAGER` сама по себе не даёт продажи.

---
