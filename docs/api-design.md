# API Design Document №7

**Проект:** ARAMAT PLUS ERP  
**Версия:** 1.0  
**Статус:** Контракт Frontend ↔ Backend  
**Связанные документы:** [Architecture №5](system-architecture.md) · [Database №6](database-design.md) · [UX №3](ux-specification.md) · [API Architecture №10](api-architecture.md) · [API notes](api.md)

---

## 1. Назначение API

API — слой связи между интерфейсом и сервером.

```
Пользователь нажимает кнопку
        ↓
Frontend отправляет HTTP/WS запрос
        ↓
Backend: RBAC → валидация → транзакция → Audit
        ↓
Database изменяется
        ↓
Frontend получает JSON / realtime-событие
```

Пример продажи:

```
Продавец → «Продать»
  → POST /api/v1/sales
  → проверка роли SELLER + storeId
  → проверка остатка (FIFO batches)
  → Sale + SaleItems + StockMovement + Audit
  → { ok, sale }
```

---

## 2. Общие правила

| Правило | Значение |
|---------|----------|
| Формат | JSON (`Content-Type: application/json`) |
| Версия | `/api/v1/...` |
| Ошибки | `{ "error": "сообщение", "code?": "..." }` |
| Успех списка | массив или `{ "data": [], "meta": { page, total } }` |
| Деньги / qty | числа в JSON; в БД `DECIMAL` |
| Идемпотентность | для `POST /sales`, `POST /transfers` — опциональный заголовок `Idempotency-Key` |
| Язык сообщений | ru (можно i18n позже) |

### Базовый URL

| Среда | URL |
|-------|-----|
| Prod (целевой) | `https://api.aramatplus.com/api/v1` |
| Phase A (Next) | `https://<app>/api` → постепенно `/api/v1` |
| Local | `http://localhost:3000/api` |

---

## 3. Авторизация

### Целевой режим (Architecture №5)

- **Access Token** (JWT, короткий TTL)
- **Refresh Token** (длинный TTL, httpOnly cookie или secure storage)

Заголовок:

```
Authorization: Bearer <access_token>
```

### Phase A (сейчас)

Auth.js session cookie + JWT strategy — те же бизнес-эндпоинты, другой транспорт сессии. Контракты тел запросов/ответов совместимы.

### Правила

- Все эндпоинты кроме `/auth/login`, `/auth/refresh` — защищены.
- На каждом запросе: проверка роли + `companyId` + привязка к store/warehouse.
- SELLER: API **не возвращает** `cost`, `purchasePrice`, `profit`, expense/analytics totals.

---

## 4. Стандарт ответа об ошибке

| HTTP | Когда |
|------|--------|
| 400 | Валидация / бизнес-правило (нет остатка) |
| 401 | Нет/просрочен токен |
| 403 | Нет права (роль / чужой магазин) |
| 404 | Сущность не найдена в company |
| 409 | Конфликт (дубликат barcode) |
| 429 | Rate limit (login) |

```json
{ "error": "Недостаточно остатка по партиям" }
```

---

## 5. AUTH API

| Method | Path | Описание |
|--------|------|----------|
| POST | `/auth/login` | Вход |
| POST | `/auth/logout` | Выход / revoke refresh |
| POST | `/auth/refresh` | Новый access token |
| POST | `/auth/change-password` | Смена своего пароля |
| POST | `/auth/reset-password` | Owner: сброс пароля сотрудника |

### POST `/auth/login`

```json
{ "username": "seller01", "password": "••••" }
```

или `email` вместо `username`.

**Ответ:**

```json
{
  "user": {
    "id": "...",
    "name": "Ali",
    "role": "SELLER",
    "storeId": "...",
    "mustChangePassword": false
  },
  "accessToken": "xxxxx",
  "refreshToken": "yyyyy"
}
```

Если `mustChangePassword: true` — UI принуждает смену пароля до работы.

### POST `/auth/change-password`

```json
{ "currentPassword": "...", "newPassword": "..." }
```

Продавец меняет **только пароль**. Логин/email меняет Owner через Users API (UX §20–21).

### POST `/auth/reset-password` (OWNER)

```json
{ "userId": "...", "newPassword": "..." }
```

или `{ "userId": "...", "generate": true }` → временный пароль в ответе **один раз**.

---

## 6. USERS API

| Method | Path | Роли | Описание |
|--------|------|------|----------|
| GET | `/users` | OWNER, MANAGER* | Список |
| POST | `/users` | OWNER | Создать |
| PATCH | `/users/:id` | OWNER | Обновить роль/магазин/active |
| POST | `/users/:id/reset-password` | OWNER | Сброс пароля |
| GET | `/users/me` | any | Свой профиль |
| PATCH | `/users/me` | any | Профиль (имя, язык, аватар; **не** email у SELLER) |

\* MANAGER — по правам.

### POST `/users`

```json
{
  "name": "Ахмад",
  "email": "ahmad@shop.local",
  "role": "SELLER",
  "storeId": "...",
  "password": "temp1234",
  "generatePassword": false
}
```

Backend: hash пароля, `mustChangePassword: true`, audit `USER_CREATE`.  
SELLER без `storeId` → 400.  
WAREHOUSE_MANAGER → нужен `warehouseId`.

---

## 7. STORES API

| Method | Path | Роли |
|--------|------|------|
| GET | `/stores` | OWNER, MANAGER |
| POST | `/stores` | OWNER, MANAGER* |
| GET | `/stores/:id` | OWNER, MANAGER |
| PATCH | `/stores/:id` | OWNER, MANAGER* |

### GET `/stores/:id`

Возвращает:

- карточку магазина;
- сотрудников;
- остатки (`stock`);
- краткую сводку;
- ссылки/вкладки истории (или вложенные query):

```
GET /stores/:id/history/sales
GET /stores/:id/history/returns
GET /stores/:id/history/discounts
GET /stores/:id/history/transfers
GET /stores/:id/history/revisions
GET /stores/:id/history/actions
```

---

## 8. PRODUCTS API

| Method | Path | Роли |
|--------|------|------|
| GET | `/products` | OWNER, MANAGER, WAREHOUSE_MANAGER; SELLER — урезанный |
| GET | `/products/search?q=` | + SELLER (свой магазин / витрина) |
| GET | `/products/:id` | по роли (cost скрыт для SELLER) |
| POST | `/products` | OWNER, MANAGER, WAREHOUSE_MANAGER |
| PATCH | `/products/:id` | OWNER, MANAGER, WAREHOUSE_MANAGER |
| DELETE | `/products/:id` | soft archive |
| POST | `/products/:id/price` | OWNER, MANAGER |

### Фильтры

```
GET /products?categoryId=&brandId=&q=&accountingType=ML
```

### Search

```
GET /products/search?q=123456789
```

Ищет по: name, brand, category, id, sku/article, barcode.

### POST `/products`

```json
{
  "name": "Dior Sauvage",
  "brandId": "...",
  "categoryId": "...",
  "accountingType": "ML",
  "salePrice": 150,
  "initialQuantity": 100,
  "costPerUnit": 100
}
```

При `initialQuantity` + `costPerUnit` создаётся первая партия на центральном складе.

### POST `/products/:id/price`

```json
{ "salePrice": 170 }
```

Не меняет старые продажи. Пишет `price_history` + audit.

---

## 9. BATCHES API

| Method | Path | Роли |
|--------|------|------|
| GET | `/products/:id/batches` | OWNER, MANAGER, WAREHOUSE_* |
| POST | `/products/:id/batches` | OWNER, MANAGER, WAREHOUSE_* |
| POST | `/batches` | альтернативный create |

### POST тело

```json
{
  "productId": "...",
  "quantity": 100,
  "purchasePrice": 100,
  "receivedAt": "2026-08-01T00:00:00Z",
  "notes": "Партия №2",
  "salePrice": 150
}
```

- `purchasePrice` → себестоимость партии (обязательно).  
- `salePrice` (опционально) → если передан, обновляет **текущую** цену товара через тот же механизм, что `/products/:id/price` (не пишет sale_price «внутрь» партии как канон).

Партии не merge.

---

## 10. WAREHOUSE / TRANSFERS API

| Method | Path | Описание |
|--------|------|----------|
| GET | `/warehouses` | Список складов |
| GET | `/warehouse/stock` | Остатки + партии |
| GET | `/warehouse/history` | Журнал склада |
| GET | `/transfers` | История перемещений |
| POST | `/transfers` | Перемещение |

### POST `/transfers`

```json
{
  "fromWarehouseId": "...",
  "toStoreId": "...",
  "items": [{ "productId": "...", "quantity": 50 }],
  "notes": null
}
```

Транзакция: FIFO batches warehouse → new batches store → stock_balances → stock_movements → transfer → audit → WS `inventory.updated`.

---

## 11. SALES API (критичный)

| Method | Path | Роли |
|--------|------|------|
| GET | `/cart` | SELLER (если серверная корзина) |
| POST | `/cart/items` | добавить |
| PATCH | `/cart/items/:id` | qty |
| DELETE | `/cart/items/:id` | |
| POST | `/cart/clear` | |
| POST | `/sales` | оформить продажу |
| GET | `/sales` | история (фильтры) |
| GET | `/sales/:id` | чек |

### Рекомендация Phase A/B

Корзина может жить на клиенте (Zustand). Тогда достаточно:

```
POST /sales
```

с полным составом корзины.

### POST `/sales`

```json
{
  "storeId": "...",
  "items": [
    { "productId": "...", "quantity": 50 },
    { "productId": "...", "quantity": 1, "isGift": true }
  ],
  "discountRequestId": null,
  "notes": null,
  "idempotencyKey": "uuid"
}
```

Backend:

1. RBAC: SELLER и `storeId` = его магазин (или OWNER).  
2. Остатки FIFO на STORE.  
3. Активные promotions → gifts.  
4. Если есть approved `discountRequestId` — применить только к этой продаже.  
5. Создать Sale, SaleItems (price/cost snapshots), StockMovement SALE, Audit.  
6. WS: `sale.created`, `inventory.updated`.

SELLER response **без** полей cost/profit по позициям (или profit только для Owner в других эндпоинтах).

---

## 12. DISCOUNT REQUESTS API

| Method | Path | Роли |
|--------|------|------|
| POST | `/discount-requests` | SELLER |
| GET | `/discount-requests` | OWNER (+ seller свои) |
| POST | `/discount-requests/:id/approve` | OWNER |
| POST | `/discount-requests/:id/reject` | OWNER |

### POST create

```json
{
  "requestedPrice": 140,
  "cartTotal": 170,
  "comment": "Постоянный клиент",
  "items": [{ "productId": "...", "quantity": 50 }]
}
```

Статус: `PENDING` → уведомление владельцу + WS.

Approve/Reject → WS продавцу. Цена товара в каталоге **не** меняется.

---

## 13. PROMOTIONS / GIFTS API

| Method | Path |
|--------|------|
| GET | `/promotions` |
| POST | `/promotions` |
| PATCH | `/promotions/:id` |
| POST | `/promotions/check` |

### POST `/promotions/check`

```json
{ "items": [{ "productId": "...", "quantity": 200 }] }
```

Ответ: список подарков, которые нужно выдать.

---

## 14. RETURNS API

| Method | Path | Роли |
|--------|------|------|
| POST | `/returns` | SELLER (request) |
| GET | `/returns` | OWNER / seller свои |
| POST | `/returns/:id/approve` | OWNER |
| POST | `/returns/:id/reject` | OWNER |

```json
{
  "saleId": "...",
  "reason": "Клиент вернул товар",
  "items": [{ "saleItemId": "...", "quantity": 10 }]
}
```

После approve: возврат в stock (batch policy) + movement RETURN + audit + analytics correction.

---

## 15. ANALYTICS API

| Method | Path | Роли |
|--------|------|------|
| GET | `/analytics/summary` | OWNER, MANAGER* |
| GET | `/analytics/stores/:id` | OWNER, MANAGER* |

Query:

```
?from=2026-08-01&to=2026-08-31&storeId=
```

или `period=today|week|month`.

Ответ summary:

- revenue, cost, profit, netProfit;
- salesCount;
- expenses (с минусом);
- discountsTotal;
- topProducts[5], topBrands[5], topCategories[5];
- bestStore, bestSeller.

SELLER → 403.

---

## 16. EXPENSES API

| Method | Path | Роли |
|--------|------|------|
| GET | `/expenses` | OWNER, MANAGER* |
| POST | `/expenses` | OWNER, MANAGER* |
| PATCH | `/expenses/:id` | OWNER |

```json
{
  "expenseTypeId": "...",
  "amount": 1500,
  "storeId": "...",
  "incurredAt": "2026-08-01",
  "description": "Аренда"
}
```

---

## 17. NOTIFICATIONS API

| Method | Path |
|--------|------|
| GET | `/notifications` |
| POST | `/notifications/:id/read` |
| POST | `/notifications/read-all` |

```json
{
  "id": "...",
  "type": "LOW_STOCK",
  "title": "Низкий остаток",
  "message": "Dior Sauvage осталось 5 мл",
  "isRead": false,
  "createdAt": "..."
}
```

---

## 18. AUDIT API

| Method | Path | Роли |
|--------|------|------|
| GET | `/audit` | OWNER, MANAGER* |

Фильтры:

```
?userId=&storeId=&action=PRICE_CHANGE&from=&to=&entityType=Product
```

---

## 19. REFERENCE DATA API

Уже в Phase A:

```
/categories  /brands  /units
/product-types  /operation-types  /expense-types
```

CRUD с RBAC OWNER/MANAGER (DELETE часто OWNER-only).

---

## 20. REALTIME (WebSocket)

Namespace: `/realtime` (JWT в connect).

| Event | Payload (кратко) | Кому |
|-------|------------------|------|
| `sale.created` | saleId, storeId, total | Owner, store managers |
| `inventory.updated` | productId, location, qty | Owner, warehouse, store |
| `notification.created` | notification | userId |
| `discount.request` | requestId | OWNER |
| `discount.resolved` | requestId, status | sellerId |
| `return.request` / `return.resolved` | … | Owner / Seller |

Phase A fallback: polling `/notifications` каждые N сек до появления WS.

---

## 21. Полный сценарий продажи (happy path)

```
1. GET  /products/search?q=Dior
2. (client cart) add items
3. optional POST /promotions/check
4. optional POST /discount-requests → wait WS discount.resolved
5. POST /sales  { items, discountRequestId? }
6. UI: чек / очистка корзины
```

Backend атомарно создаёт: Sale, SaleItems, StockMovements, AuditLog (+ обновляет StockBalance/Batch).

---

## 22. Матрица прав (сводка endpoint groups)

| Group | OWNER | MANAGER | WAREHOUSE | SELLER |
|-------|-------|---------|-----------|--------|
| Auth self | ✅ | ✅ | ✅ | ✅ |
| Users admin | ✅ | ❌* | ❌ | ❌ |
| Stores write | ✅ | ✅* | ❌ | ❌ |
| Products / batches | ✅ | ✅* | ✅ | read search only |
| Transfers | ✅ | ✅* | ✅ | ❌ |
| Sales create | ✅ | ✅* | ❌ | ✅ (свой store) |
| Discount approve | ✅ | ❌* | ❌ | create only |
| Returns approve | ✅ | ❌* | ❌ | request only |
| Analytics | ✅ | ✅* | ❌ | ❌ |
| Expenses | ✅ | ✅* | ❌ | ❌ |
| Audit | ✅ | ✅* | limited | ❌ |

\* по назначенным правам / магазинам.

---

## 23. Итоговая карта ресурсов

```
/auth
/users
/stores
/warehouses
/products
/batches
/warehouse
/transfers
/sales
/cart                 (optional)
/discount-requests
/promotions
/returns
/analytics
/expenses
/notifications
/audit
/categories|/brands|/units|...
```

---

## 24. Соответствие Phase A (текущий код)

| Документ | Сейчас в репозитории |
|----------|----------------------|
| `/auth/*` | Auth.js + `/api/auth/change-password`, `reset-password` |
| `/users` | `/api/users` |
| `/stores` | `/api/stores`, `/api/stores/[id]` |
| `/products` | `/api/products`, `.../batches`, `.../price` |
| `/warehouse/stock` | `/api/warehouse/stock` |
| `/transfers` | `/api/transfers` |
| `/sales`, cart, discounts, returns, analytics | ⏳ следующие milestone |
| `/api/v1` prefix | ⏳ ввести при NestJS / versioning |
| WebSocket | ⏳ |

Контракты тел запросов при переносе на NestJS сохраняются.

---

## 25. Нефункциональные требования

API должен быть:

- безопасным (JWT/RBAC/hash/audit);
- масштабируемым (пагинация, индексы, idempotency);
- быстрым (POS search & sale < ощутимой задержки);
- с полной историей;
- готовым к отдельному мобильному клиенту (тот же `/api/v1`).

---

## Следующий документ

**№8 — User Flow Specification**

Сценарии из жизни:

- владелец добавляет магазин и продавца;
- поставка и партии;
- перемещение на магазин;
- продажа / скидка / возврат;
- ревизия;
- сброс пароля и первый вход.

---

## Итог

API — единственный канал изменения данных.  
Каждая мутация: **RBAC → validate → transaction → audit → (realtime)**.  
Seller API урезан по полям.  
Продажа и перемещение — транзакционные и идемпотентные.
