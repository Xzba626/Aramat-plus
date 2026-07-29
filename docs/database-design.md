# Database Design Document №6

**Проект:** ARAMAT PLUS ERP  
**Версия:** 1.0  
**Статус:** Чертёж БД перед стабильными миграциями  
**Связанные документы:** [Vision](vision.md) · [Architecture №5](system-architecture.md) · [Batch rules](batch-rules.md) · [UX](ux-specification.md)

---

## 1. Общая идея базы данных

База данных строится не только под текущие 7–8 магазинов, а под рост:

- 100+ магазинов;
- несколько складов в будущем;
- тысячи товаров;
- десятки / сотни тысяч продаж;
- большое количество сотрудников;
- **полная история** всех действий и движений товара.

### Главный принцип

**Нельзя хранить только текущий остаток.**

Нужна полная история движения:

```
Товар: Dior Sauvage

Партия №1 | 01.08.2026 | закуп 100 с. | 100 мл
Партия №2 | 15.08.2026 | закуп 120 с. |  50 мл

Движения (продажи / передачи / возвраты): −20, −10, −5 …

Текущий остаток (денормализация): 115
```

Остаток в `inventory` / `stock_balances` — **кэш для быстрого чтения**.  
Источник истины по количеству и себестоимости — **партии + движения**.

---

## 2. Основные группы таблиц

| Блок | Таблицы (логические имена) |
|------|----------------------------|
| Организация | `companies`, `warehouses`, `stores` |
| Пользователи | `users`, `roles` / enum, `permissions`, `user_permissions`, `user_store_access` |
| Справочники | `categories`, `brands`, `units`, `product_types`, `expense_types` |
| Товары | `products`, `product_images`, `product_barcodes`, `price_history` |
| Склад | `product_batches`, `stock_balances`, `stock_movements`, `transfers`, `transfer_items` |
| Продажи | `sales`, `sale_items` (+ опционально `carts` / клиентская корзина) |
| Скидки и акции | `promotions` / `gift_rules`, `discount_requests` |
| Возвраты | `returns`, `return_items` |
| Ревизия | `inventory_sessions`, `inventory_items` |
| Финансы | `expenses` |
| Уведомления | `notifications` |
| История | `audit_logs` / `activity_logs` |
| Настройки | `settings` |

> В Prisma используются PascalCase-модели (`Product`, `Batch`…). Ниже — логические SQL-имена и маппинг на текущую схему.

---

## 3. Инварианты ценообразования (критично)

Согласовано с Vision / Architecture / Batch rules:

| Что | Где хранится |
|-----|----------------|
| **Текущая цена продажи** | `products.sale_price` |
| **История цен продажи** | `price_history` |
| **Себестоимость** | `product_batches.purchase_price` (cost) — **на партии** |
| **Цена и себестоимость в продаже** | snapshot в `sale_items` (`price`, `cost`) |

**Не хранить «единственную себестоимость» только на товаре** — иначе теряется история закупок.

Поле `sale_price` **на партии** допускается только как «цена на момент прихода» (справочно), но **каноническая текущая цена продажи** — на `products`. Изменение цены владельцем обновляет `products` + пишет `price_history`, не переписывает старые партии и продажи.

Партии **никогда не сливаются** (не average cost).

Списание: **FIFO** по `product_batches.received_at` в рамках локации.

---

## 4. Организация

### companies

Мультитенантность / white-label (Vision §21).

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID/CUID | PK |
| name | String | Название компании |
| logo_url | String? | Логотип |
| brand_color | String? | Цвет бренда (hex) |
| currency | String | По умолчанию `TJS` |
| created_at | DateTime | |
| updated_at | DateTime | |

Все ключевые сущности содержат `company_id`.

### warehouses

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | PK |
| company_id | UUID | FK |
| name | String | Центральный склад / Склад Худжанд |
| address | String? | |
| is_active | Boolean | |
| created_at | DateTime | |

Сейчас: 1 склад. Архитектура готова к N складам.

### stores

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | PK |
| company_id | UUID | FK |
| name | String | ARAMAT PLUS Душанбе 1 |
| address | String? | |
| phone | String? | |
| manager_id | UUID? | FK users (ответственный) |
| is_active | Boolean | |
| created_at | DateTime | |

Количество магазинов **не ограничено**.

---

## 5. Пользователи и доступ

### users

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | PK |
| company_id | UUID | FK |
| name | String | |
| phone | String? | |
| email | String | unique (или unique per company) |
| username | String? | логин (если отдельно от email) |
| password_hash | String | **только хеш** |
| role | Enum/FK | OWNER / MANAGER / WAREHOUSE_MANAGER / SELLER |
| store_id | UUID? | основной магазин (SELLER) |
| warehouse_id | UUID? | основной склад (WAREHOUSE_MANAGER) |
| must_change_password | Boolean | после временного пароля |
| is_active | Boolean | |
| created_at | DateTime | |
| updated_at | DateTime | |

**Пароль владельцу не показывается.** Хранится только `password_hash`. Сброс = новый временный хеш.

### roles / permissions (гибкий RBAC)

Минимум — enum ролей.  
Для масштаба — таблицы:

**roles:** `id`, `code`, `name`  
**permissions:** `id`, `code`, `description`  
**role_permissions:** `role_id`, `permission_id`  
**user_store_access:** `user_id`, `store_id` (для MANAGER с несколькими магазинами)  
**user_warehouse_access:** `user_id`, `warehouse_id`

Стартовые роли:

| code | Название |
|------|----------|
| OWNER | Владелец |
| MANAGER | Менеджер |
| WAREHOUSE_MANAGER | Кладовщик |
| SELLER | Продавец |

---

## 6. Справочники товаров

### categories

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | |
| company_id | UUID | |
| name | String | Парфюм мужской, Часы… |
| parent_id | UUID? | дерево категорий |
| low_stock_threshold | Decimal | порог уведомления по умолчанию |

### brands

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | |
| company_id | UUID | |
| name | String | Dior, Chanel… |
| image_url | String? | |

### units / product_types / expense_types

Справочники единиц (`мл`, `шт`), типов товара, типов расходов — с `company_id`.

---

## 7. Товары

### products

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | внутренний ID |
| company_id | UUID | |
| article / sku | String? | артикул `AR-000001` или ручной |
| name | String | Sauvage |
| brand_id | UUID? | |
| category_id | UUID? | |
| product_type_id | UUID? | |
| unit_id | UUID? | |
| accounting_type | Enum | `PIECE` \| `ML` \| `GRAM` (или WEIGHT) |
| sale_price | Decimal(12,2) | **текущая** цена продажи |
| low_stock_threshold | Decimal? | override категории |
| is_active | Boolean | архив = false |
| created_at | DateTime | |
| updated_at | DateTime | |

### product_images

| Поле | Описание |
|------|----------|
| id | |
| product_id | FK |
| url | Cloudinary/S3 |
| sort_order | |
| is_primary | |

### product_barcodes

| Поле | Описание |
|------|----------|
| id | |
| product_id | FK |
| code | уникальный штрих-код |
| type | EAN13 / CODE128 / INTERNAL |

Поиск POS: name + brand + category + id + sku + barcode.

### price_history

| Поле | Описание |
|------|----------|
| id | |
| product_id | |
| old_price | |
| new_price | |
| changed_by_id | user |
| created_at | |

---

## 8. Партии товара — `product_batches`

Одна из самых важных таблиц.

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | |
| product_id | UUID | FK |
| location_type | Enum | WAREHOUSE \| STORE |
| location_id | UUID | id склада или магазина |
| purchase_price | Decimal(12,4) | **себестоимость партии** |
| quantity | Decimal(14,3) | текущий остаток партии |
| initial_quantity | Decimal(14,3) | сколько было при создании |
| received_at | DateTime | дата прихода |
| notes | String? | комментарий |
| source_transfer_item_id | UUID? | если пришла с перемещения |
| created_at | DateTime | |

Пример:

```
Dior Sauvage
Batch 1 | 100 мл | cost 100
Batch 2 | 100 мл | cost 130
```

Правила: не merge; FIFO при SALE / TRANSFER; при перемещении на магазин создаётся **новая** партия с тем же `purchase_price`.

---

## 9. Остатки — `stock_balances` (inventory)

Денормализованный остаток для быстрого UI.

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | |
| product_id | UUID | |
| location_type | Enum | WAREHOUSE \| STORE |
| location_id | UUID | |
| quantity | Decimal(14,3) | сумма партий локации |
| updated_at | DateTime | |

**UNIQUE** `(product_id, location_type, location_id)`.

Обновляется только внутри транзакции вместе с batches / movements.

---

## 10. Движение товара — `stock_movements`

Полный журнал движения (рекомендуется явно, даже если есть Transfer/Sale).

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | |
| company_id | UUID | |
| type | Enum | PURCHASE, TRANSFER, SALE, RETURN, ADJUSTMENT, INVENTORY |
| product_id | UUID | |
| batch_id | UUID? | какая партия затронута |
| quantity | Decimal | знак: − со склада, + на магазин (или две записи) |
| from_location_type | Enum? | |
| from_location_id | UUID? | |
| to_location_type | Enum? | |
| to_location_id | UUID? | |
| user_id | UUID | кто сделал |
| reference_type | String? | Sale / Transfer / Return… |
| reference_id | UUID? | |
| created_at | DateTime | |

Типы: `PURCHASE` · `TRANSFER` · `SALE` · `RETURN` · `ADJUSTMENT` · `INVENTORY`.

### transfers / transfer_items

Документ перемещения (шапка + строки) — для UI и печати; параллельно пишет `stock_movements` + меняет batches.

---

## 11. Корзина — `carts` (опционально)

Для POS возможны два подхода:

**A (рекомендуется для скорости):** корзина в Zustand на клиенте, commit одной транзакцией `POST /sales`.  
**B:** серверные `carts` / `cart_items` для восстановления после обрыва связи.

Если таблица нужна:

| carts | cart_items |
|-------|------------|
| seller_id, store_id, status (OPEN/CHECKED_OUT) | product_id, quantity, unit_price |

---

## 12. Продажи

### sales

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | |
| store_id | UUID | |
| seller_id | UUID | |
| status | Enum | COMPLETED / RETURNED / PARTIAL_RETURN |
| subtotal | Decimal | до скидки |
| discount_amount | Decimal | |
| total / final_amount | Decimal | к оплате |
| notes | String? | |
| created_at | DateTime | |

### sale_items

| Поле | Тип | Описание |
|------|-----|----------|
| id | UUID | |
| sale_id | UUID | |
| product_id | UUID | |
| batch_id | UUID? | партия FIFO |
| quantity | Decimal | шт или мл |
| price | Decimal | **snapshot** цены продажи |
| cost | Decimal | **snapshot** себестоимости |
| is_gift | Boolean | подарок по акции |
| profit | Decimal? | generated/computed: (price−cost)×qty |

Прибыль можно считать на чтении; хранение `profit` — опциональная денормализация.

---

## 13. Скидки, акции, подарки

### gift_rules / promotions

| Поле | Описание |
|------|----------|
| id, company_id, name | |
| condition | JSON или поля: min_qty_ml, min_items, min_amount |
| gift_product_id | что выдать |
| gift_quantity | |
| is_active | |

### discount_requests

| Поле | Описание |
|------|----------|
| seller_id | |
| store_id | |
| sale_id / cart_ref | опционально до завершения продажи |
| old_price / requested_price / amount | |
| reason / comment | «Постоянный клиент» |
| status | PENDING / APPROVED / REJECTED |
| approved_by | |
| reviewed_at | |

Одобренная скидка применяется **только к текущей продаже**, не меняет `products.sale_price`.

---

## 14. Возвраты

### returns (+ return_items)

| returns | return_items |
|---------|--------------|
| sale_id, seller_id, reason, status, approved_by | product_id, quantity, sale_item_id |

Статусы: `PENDING` · `APPROVED` · `REJECTED`.  
При APPROVED: возврат в batch/stock + stock_movement RETURN + audit.

---

## 15. Ревизия

### inventory_sessions / inventory_items

Сессия: store, created_by, approved_by, status, comment.  
Строки: product, expected_qty, counted_qty, difference, discrepancy_reason.  
При закрытии — ADJUSTMENT movements + audit.

---

## 16. Финансы — `expenses`

| Поле | Описание |
|------|----------|
| store_id | nullable для общесетевых |
| expense_type_id | аренда, зарплата, коммунальные, реклама… |
| amount | |
| incurred_at / date | |
| created_by_id | |
| description | |

Отдельные таблицы `salaries` / `rent` не обязательны, если покрыты `expense_types`.

---

## 17. Уведомления — `notifications`

| Поле | Описание |
|------|----------|
| user_id | получатель |
| type | LOW_STOCK, DISCOUNT_REQUEST, RETURN_REQUEST… |
| title, message | |
| entity_type, entity_id | deep link |
| is_read | |
| created_at | |

---

## 18. Аудит — `audit_logs` (activity_logs)

Самая важная таблица истории.

| Поле | Описание |
|------|----------|
| id | |
| company_id | |
| user_id | кто |
| action | код действия |
| entity_type | Product, Sale, Price… |
| entity_id | |
| store_id / warehouse_id | где |
| old_value | JSON |
| new_value | JSON |
| comment | |
| ip_address | опционально |
| created_at | когда |

Пример:

```
15.08.2026 10:45 | OWNER
PRICE_CHANGE | Product Dior Sauvage
150 → 170 сомони
```

Каждое значимое действие (создание товара, цена, партия, продажа, возврат, перемещение, пользователь, магазин) → запись в audit.

---

## 19. Настройки — `settings`

| Поле | Описание |
|------|----------|
| company_id | |
| key | `brand.color`, `low_stock.default`… |
| value | JSON |

---

## 20. Связи (ER, упрощённо)

```
Company 1──* User, Store, Warehouse, Product, Category, Brand

User *──1 Role (enum)
User *──? Store          (продавец)
User *──? Warehouse      (кладовщик)
User *──* Store          (manager access)

Product *──? Brand, Category, Unit
Product 1──* Batch
Product 1──* StockBalance
Product 1──* PriceHistory
Product 1──* ProductImage, ProductBarcode

Batch *── location (Warehouse|Store)

Sale *──1 Store, User(seller)
Sale 1──* SaleItem *──1 Product
SaleItem *──? Batch

Transfer: Warehouse → Store + TransferItems
DiscountRequest, Return → approval by Owner
AuditLog *──? User
```

---

## 21. Главный поток данных

```
Поставка
  ↓
Центральный склад + product_batches
  ↓
stock_movements (PURCHASE)
  ↓
Перемещение → магазины (TRANSFER + новые batches)
  ↓
Продажи (SALE, FIFO, sale_items snapshots)
  ↓
Возвраты / ревизии (RETURN / ADJUSTMENT)
  ↓
Analytics (агрегации по sales, expenses, discounts)
  ↓
Прибыль
```

---

## 22. Индексы (обязательные)

| Таблица | Индекс |
|--------|--------|
| products | `(company_id, name)`, sku unique per company |
| product_barcodes | `code` UNIQUE |
| product_batches | `(product_id, location_type, location_id, received_at)` |
| stock_balances | UNIQUE `(product_id, location_type, location_id)` |
| sales | `(store_id, created_at)`, `(seller_id, created_at)` |
| sale_items | `(sale_id)`, `(product_id)` |
| stock_movements | `(company_id, created_at)`, `(product_id, created_at)` |
| audit_logs | `(company_id, created_at)`, `(user_id, created_at)`, `(entity_type, entity_id)` |
| notifications | `(user_id, is_read, created_at)` |
| users | `email` UNIQUE, `(company_id, role)` |

---

## 23. Типы / Enums (сводка)

```
Role: OWNER | MANAGER | WAREHOUSE_MANAGER | SELLER
AccountingType: PIECE | ML | GRAM
LocationType: WAREHOUSE | STORE
StockMovementType: PURCHASE | TRANSFER | SALE | RETURN | ADJUSTMENT | INVENTORY
SaleStatus: COMPLETED | RETURNED | PARTIAL_RETURN
DiscountRequestStatus: PENDING | APPROVED | REJECTED
ReturnStatus: PENDING | APPROVED | REJECTED
TransferStatus: PENDING | COMPLETED | CANCELLED
InventoryStatus: IN_PROGRESS | COMPLETED | CANCELLED
```

Денежные поля: `DECIMAL`, не `FLOAT`.  
Количества разливных: `DECIMAL(14,3)`.

---

## 24. Маппинг на текущий Prisma (Phase A)

| Документ №6 | Текущая модель Prisma | Статус |
|-------------|----------------------|--------|
| companies | `Company` | ✅ |
| users | `User` | ✅ (добавить phone, mustChangePassword, warehouseId, WAREHOUSE_MANAGER) |
| stores / warehouses | `Store`, `Warehouse` | ✅ |
| categories / brands / units | ✅ | |
| products | `Product` | ✅ (+ barcodes/images как отдельные таблицы — next) |
| product_batches | `Batch` | ✅ |
| inventory | `StockBalance` | ✅ |
| transfers | `Transfer`, `TransferItem` | ✅ |
| sales / sale_items | `Sale`, `SaleItem` | ✅ |
| price_history | `PriceHistory` | ✅ |
| discount_requests | `DiscountRequest` | ✅ |
| gifts | `GiftRule` | ✅ |
| returns | `SaleReturn` | ✅ (добавить return_items) |
| expenses | `Expense` | ✅ |
| notifications | `Notification` | ✅ |
| audit_logs | `ActivityLog` | ✅ (расширить old/new JSON, storeId, ip) |
| stock_movements | — | ⏳ добавить |
| product_images / barcodes | — | ⏳ добавить |
| permissions / user_store_access | — | ⏳ добавить |
| carts | клиент Zustand | ✅ допустимо |

Миграции «догоняющие» делаются после утверждения №6, без ломки инвариантов партий.

---

## 25. Что зафиксировано дополнительно (vs простое ТЗ)

- ✅ партии товаров без merge  
- ✅ история изменения цен  
- ✅ несколько складов в будущем  
- ✅ подарки / акции  
- ✅ запросы скидок с approval  
- ✅ полный audit  
- ✅ RBAC + изоляция продавца  
- ✅ подготовка к 100+ магазинам (`company_id`, индексы)  
- ✅ разделение себестоимости (batch) и цены продажи (product)  
- ✅ защита паролей (только hash)  
- ✅ stock_movements как полный журнал движения  
- ✅ штрих-коды и артикулы для поиска  

---

## 26. Чего нельзя делать в схеме

- ❌ одна «средняя» себестоимость на товаре без партий;  
- ❌ удаление продаж / партий без следа;  
- ❌ хранение plaintext паролей;  
- ❌ FLOAT для денег;  
- ❌ остаток без возможности восстановить историю движений;  
- ❌ цена продажи только на партии как единственный источник (ломает центральное ценообразование со склада).

---

## Итог

Документ №6 — **чертёж БД**: история важнее «текущей цифры на экране».

Поток:

```
Поставка → Склад → Партии → Магазины → Продажи → Аналитика → Прибыль
```

Всегда с `stock_movements` + `audit_logs`.

**Следующий шаг:** актуализировать `prisma/schema.prisma` под пробелы (§24) отдельной миграцией `schema_v2`, затем документ API / User Flows.
