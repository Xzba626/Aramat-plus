# API Architecture Document №10

**Проект:** ARAMAT PLUS ERP  
**Версия:** 1.0  
**Статус:** Архитектура взаимодействия Frontend ↔ Backend  
**Связанные документы:** [Architecture №5](system-architecture.md) · [API Design №7](api-design.md) · [Database №6](database-design.md) · [User Flows №8](user-flows.md) · [Frontend Architecture №11](frontend-architecture.md)

> **Связь с №7:** документ №7 — детальный контракт эндпоинтов (поля, статусы, матрица прав).  
> Документ **№10** — как устроен слой API в целом, стек Phase A, принципы и карта страниц → API.  
> При расхождении деталей приоритет у **№7 + №6**; при выборе «где живёт backend» — см. §2 ниже.

---

## 1. Общая архитектура системы

Полноценное веб-приложение (PWA):

```
                 Пользователь
                      |
              Frontend (Next.js)
                      |
                  API Layer
                      |
              Backend Logic (services)
                      |
          Prisma ORM + PostgreSQL
                      |
                  Database
```

Дополнительно: Audit на каждой мутации · RBAC · Realtime (WS/SSE) · File storage для фото.

**Никогда:** Frontend напрямую не пишет в БД.

**Всегда:**

```
Frontend → API → проверка прав → транзакция → Database → ответ (+ audit / events)
```

---

## 2. Технологический стек

### Frontend

| Технология | Назначение |
|------------|------------|
| Next.js + TypeScript | App Router, PWA, Owner + Seller UI |
| Tailwind CSS + UI kit | Design System №4 |
| Zustand | Корзина продавца (клиент) |
| RHF + Zod | Формы |

### Backend — решение по фазам

| Фаза | Реализация | Когда |
|------|------------|--------|
| **Phase A (рекомендуется сейчас)** | Next.js **API Routes** + `src/lib/services/*` (+ Server Actions где уместно) | Milestone 1–2, быстрый цикл |
| **Phase B** | Вынос в **NestJS**, те же URL/контракты `/api/v1` | Рост нагрузки, команды, интеграции |

Документ №5 фиксирует NestJS как долгосрочную цель.  
Документ №10 закрепляет: **для текущей системы достаточно Next.js API Layer**, если бизнес-логика изолирована в services (уже так в репозитории).

### Database

PostgreSQL + Prisma ORM (см. №6).

---

## 3. Авторизация

### POST `/api/auth/login`

```json
{ "login": "seller01", "password": "••••" }
```

(или `email` / `username`)

Backend:

1. ищет пользователя (`company` + active);  
2. проверяет `password_hash`;  
3. проверяет роль и привязку;  
4. создаёт сессию / выдаёт tokens.

**Ответ:**

```json
{
  "user": {
    "id": "123",
    "name": "Ali",
    "role": "SELLER",
    "storeId": "5",
    "mustChangePassword": false
  }
}
```

Phase A: Auth.js session cookie.  
Phase B / целевой: JWT Access + Refresh (№5, №7).

Также: `POST /api/auth/logout`, `change-password`, `reset-password` (Owner).

---

## 4. Проверка доступа (на каждый запрос)

Обязательные вопросы middleware/guard:

1. Кто пользователь?  
2. Какая роль?  
3. К какому магазину / складу относится?  
4. Какие права на этот ресурс?

Примеры:

| Запрос | SELLER | OWNER |
|--------|--------|-------|
| `GET /products` (POS search) | Витрина / остатки **своего** магазина, **без** cost | Весь каталог + склад + cost |
| `POST /sales` | Только `storeId` = свой | Любой store (редко) |
| `GET /analytics/*` | 403 | OK |

Чужой `storeId` → **403**.

---

## 5. Карта API (структура)

```
/api
  /auth
  /users
  /stores
  /warehouses
  /products
  /categories
  /brands
  /units | /product-types | …
  /inventory          (или /warehouse/stock)
  /batches
  /transfers
  /sales
  /discount-requests
  /gifts | /promotions
  /returns
  /analytics
  /expenses
  /revisions          (inventory sessions)
  /notifications
  /logs | /audit
```

Версионирование целевое: `/api/v1/...` (№7). Phase A может жить на `/api/...` с тем же смыслом путей.

---

## 6. Пользователи

| Method | Path | Описание |
|--------|------|----------|
| GET | `/api/users` | Список (Owner) |
| POST | `/api/users` | Создать сотрудника |
| POST | `/api/users/{id}/reset-password` | Сброс пароля |
| PATCH | `/api/users/me` | Профиль (пароль — отдельный auth endpoint) |

### POST `/api/users`

```json
{
  "name": "Ахмад",
  "role": "SELLER",
  "storeId": "1",
  "email": "ahmad@…",
  "generatePassword": true
}
```

Система: hash пароля · `mustChangePassword` · связь с магазином · audit.  
Пароль владельцу после сохранения **не доступен**.

---

## 7. Магазины

| Method | Path |
|--------|------|
| GET | `/api/stores` |
| POST | `/api/stores` |
| GET | `/api/stores/{id}` |
| GET | `/api/stores/{id}/history/*` |

Ответ списка: name, address, …  
Детали: сотрудники, остатки, входы в журналы магазина (UX §24).

---

## 8–9. Товары

| Method | Path |
|--------|------|
| GET | `/api/products` |
| GET | `/api/products/search?q=` |
| POST | `/api/products` |
| PATCH | `/api/products/{id}` |
| POST | `/api/products/{id}/price` |

Фильтры: `brand`, `category`, `barcode`, `search` / `q`.

Ответ для продавца (урезанный):

```json
{
  "name": "Dior Sauvage",
  "brand": "Dior",
  "type": "UNIT",
  "price": 150,
  "stock": 50,
  "available": true
}
```

Без `purchasePrice` / `cost` / `profit`.

### Создание

```json
{
  "name": "Dior Sauvage",
  "brandId": "1",
  "categoryId": "2",
  "type": "UNIT",
  "barcode": "938472",
  "salePrice": 150
}
```

---

## 10. Штрих-код

| Method | Path |
|--------|------|
| POST | `/api/products/barcode` | сгенерировать код |
| POST | `/api/products/{id}/barcodes` | привязать к товару |

Ответ генерации: `{ "barcode": "482938472938" }` → печать наклейки.

Поиск продавцом: название · бренд · категория · ID · штрих-код → `GET /api/products/search?q=123`.

---

## 11–13. Склад и перемещения

| Method | Path |
|--------|------|
| GET | `/api/inventory/warehouse` или `/api/warehouse/stock` |
| POST | `/api/products/{id}/batches` | новая партия |
| POST | `/api/transfers` | склад → магазин |
| POST | `/api/transfers/{id}/approve` | если двухшаговое подтверждение |

### Перемещение (упрощённое тело)

```json
{
  "storeId": "5",
  "fromWarehouseId": "…",
  "items": [{ "productId": "10", "quantity": 20 }]
}
```

**Решение по approve:**  
- Milestone 1: `POST /transfers` сразу COMPLETED (одна транзакция).  
- Опционально позже: PENDING → `approve` для четырёхглазого контроля.

После успеха: склад −N · магазин +N · FIFO · audit `TRANSFER_CREATED` · WS `inventory.updated`.

---

## 14–15. Продажа и корзина

### Корзина

**Только на frontend** (Zustand) — по этому документу и №7/№8.

UI: позиции, цены продажи, итог. Себестоимость не показывается.

### POST `/api/sales`

```json
{
  "items": [{ "productId": "1", "quantity": 2 }],
  "discountRequestId": null
}
```

Backend:

1. права + storeId продавца;  
2. остаток (FIFO);  
3. цена (snapshot);  
4. подарки;  
5. скидка (если approved);  
6. Sale + SaleItems + StockMovement + Audit;  
7. аналитика side-effects.

Ответ:

```json
{ "success": true, "total": 300, "saleId": "…" }
```

---

## 16. Запрос скидки

```
POST /api/discount-request
{ "requestedPrice": 300, "comment": "…", "items": […] }

Owner: POST /api/discount-request/{id}/approve | reject
```

После approve корзина на клиенте обновляет отображаемую сумму; каталожная цена товара не меняется.

---

## 17. Подарки

```
POST /api/gifts  (Owner — правило)
{
  "buyQuantity": 200,
  "unit": "ml",
  "giftProductId": "…"
}
```

При `POST /sales` или `POST /promotions/check` backend проверяет условие и сообщает подарок.

---

## 18. Возврат

```
Seller: POST /api/returns  → status REQUESTED/PENDING
Owner:  POST /api/returns/{id}/approve
```

После approve: товар в остаток · коррекция продажи/аналитики · история.

---

## 19–20. Аналитика

| Path | Назначение |
|------|------------|
| GET `/api/analytics/dashboard` | Сводка «утра» / KPI |
| GET `/api/analytics/store/{id}` | Магазин: продажи, прибыль, расходы, скидки, топы |
| GET `/api/analytics?from=&to=` | Период |

Только Owner / Manager*. Seller → 403.

---

## 21. Расходы

```
POST /api/expenses
{ "type": "rent", "amount": 1500, "storeId": "…" }
```

(или `expenseTypeId` по схеме №6.)

---

## 22. История действий (logs / audit)

```
GET /api/logs?user=&store=&action=&date=
```

```json
{
  "user": "Admin",
  "action": "CHANGE_PRICE",
  "old": "150",
  "new": "170",
  "time": "15:30"
}
```

Алиас: `/api/audit` (№7).

---

## 23. Уведомления

```
GET /api/notifications
```

```json
{
  "title": "Мало товара",
  "message": "Dior Sauvage осталось 5 шт"
}
```

+ mark read endpoints (№7).

---

## 24. Ревизия

| Step | Path |
|------|------|
| Создать | `POST /api/revisions` |
| Строки факта | `POST /api/revisions/items` |
| Завершить | `POST /api/revisions/{id}/complete` |

Создаёт акт, ADJUSTMENT movements, audit.

---

## 25. Frontend страницы ↔ API

### Владелец (Owner Console)

```
/dashboard          → analytics/dashboard, notifications
/analytics          → analytics/*
/stores             → stores
/warehouse          → inventory, products, batches, transfers
/products           → products
/users              → users
/history|/logs      → logs/audit
/revisions          → revisions
/settings           → categories, brands, gifts, settings
```

### Продавец (Seller POS)

```
/pos или /seller    → products/search, sales
+ cart (client)
+ sales history     → sales?mine=1
+ profile           → users/me, change-password
+ notifications     → notifications
```

Маршруты UI см. UI Design System №4 и текущий `(owner)` / `(seller)` layout.

---

## 26. Реальное обновление данных

Варианты:

| Механизм | Использование |
|----------|----------------|
| WebSocket | Предпочтительно (NestJS gateway / Phase B) |
| Server-Sent Events | Проще на Vercel serverless с ограничениями |
| Polling | Phase A fallback для notifications / discount status |

Примеры событий: цена обновлена · `inventory.updated` · `discount.resolved` · `notification.created`.

---

## 27. Главный принцип API

```
❌ Frontend напрямую меняет данные / «доверяет» себе остатки

✅ Frontend → API → RBAC → Validate → Transaction → DB → Audit → Response
```

Все финансовые и складские изменения — только на сервере.

---

## 28. Подготовка под другие клиенты (white-label)

В коде и схеме **не хардкодить** «AromatPlus» как единственный бренд.

Использовать:

- `Company`
- Brand / Theme settings (логотип, цвета)
- Справочники на `companyId`

Тогда одна платформа → ARAMAT PLUS → другой клиент без переписывания ядра (Vision §21).

---

## 29. Соответствие текущему репозиторию (Phase A)

| №10 | Сейчас |
|-----|--------|
| Next.js API Routes + services | ✅ |
| Auth login/session | ✅ Auth.js |
| users, stores, products, batches, warehouse, transfers | ✅ |
| sales, discounts, returns, analytics, revisions | ⏳ по roadmap |
| Корзина на frontend | ✅ задумано (Zustand) |
| companyId / white-label | ✅ в схеме |
| WebSocket | ⏳ |

Детальные тела запросов и матрица ролей — в **[API Design №7](api-design.md)**.

---

## Следующий документ

**№11 — FRONTEND ARCHITECTURE**

Структура Next.js/React: страницы Owner vs Seller, компоненты, Design System, мобильный POS и desktop Console.

---

## Итог

API Architecture №10 закрепляет:

1. Единый канал изменений — только API.  
2. Phase A = Next.js API + Prisma (достаточно для старта).  
3. Phase B = NestJS без смены контрактов UI.  
4. RBAC и изоляция магазина на каждом запросе.  
5. Корзина продавца на клиенте; продажа — атомарный `POST /sales`.  
6. Платформа на `Company`, не на захардкоженном бренде.
