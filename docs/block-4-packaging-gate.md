# Block 4 — Packaging / Liquid + Bottle — Implementation Gate

**Проект:** ARAMAT PLUS  
**Статус:** Gate — **реализация запрещена**, пока gate не подтверждён  
**Приоритет:** перед Notifications, Inbox, CRM  
**Связь:** [packaging-bottle-model.md](packaging-bottle-model.md) · [vision.md](vision.md) · [architecture.md](architecture.md)

---

## Зачем Block 4

Без разлива + флаконов Aramat Plus — хороший склад + POS.  
С Block 4 — **CRM для парфюмерной сети** (уникальная часть продукта).

Порядок после foundation:

1. Seller isolation (тест) — ✅ зафиксирован  
2. Control Center — завершение  
3. **Block 4 — Liquid + Bottle** ← этот документ  
4. Owner Inbox  
5. Customer CRM  

---

## Gate: подтвердить перед любым кодом Block 4

Реализация **не начинается**, пока не приняты все пункты:

| # | Правило |
|---|---------|
| 1 | **Packaging не является Product.** Отдельная сущность `PackagingSku`. |
| 2 | **Packaging никогда не попадает в Seller POS catalog** (`GET /api/pos/catalog`). |
| 3 | **Packaging не создаёт Revenue.** Нет `salePrice`, нет строки выручки. |
| 4 | **Packaging участвует только в COGS** (не в Expense: аренда, ЗП, коммунальные). |
| 5 | **WEIGHT sale невозможен без выбора Bottle** (PackagingSku). |
| 6 | **Liquid FIFO + Bottle FIFO — одна DB transaction** в `createSale`. |
| 7 | **Запрещено** создавать `Dior 5ml` / `Dior 10ml` / `Dior 50ml` как `Product`. |
| 8 | **`stock.service` / `deductBatchesFifo` не переписывать** — только расширить (packaging batches parallel spine). |

---

## Seller Isolation (фундамент, отдельно от Block 4)

Архитектурное правило доступа, не UI-фильтр:

```
WAREHOUSE (1000 ml)
      ↓ Transfer
STORE 1 (300 ml)
      ↓
POS Seller Store 1 → видит 300 ml
      ✗ не видит 700 ml склада
```

| Канал | Источник остатка |
|-------|------------------|
| **Seller POS** (BRANCH) | `Store Stock` только своего магазина |
| **Owner Direct POS** | `Warehouse Stock` (намеренно, другой канал) |

**Seller POS ≠ Warehouse POS.** Не смешивать.

Smoke: `npm run test:seller-isolation`

---

## Именование: PackagingSku

Предпочтительное имя сущности: **`PackagingSku`** (готовая упаковочная единица, не «сырьё»).

Альтернативы в обсуждении: `BottleSku`, `PackagingItem`. В коде — **`PackagingSku`**.

### Пример карточки

| Поле | Пример |
|------|--------|
| ID | `001` |
| Название | Флакон стекло |
| Объём | 10 ml |
| Материал | Glass |
| Цвет | Прозрачный |
| Крышка | Black |
| Себестоимость (справочная) | 0.80 сомони |
| Accounting | `PACKAGING` |

### Что есть у PackagingSku

| ✅ | ❌ |
|----|-----|
| Склад (warehouse + store) | Продажа |
| Приход / партии | Цена продажи |
| FIFO | Выручка |
| Себестоимость (на партии) | Отдельный товар в POS |
| Остаток по магазинам | Прибыль как SKU |

Новый enum (целевой): `AccountingType.PACKAGING` — только для packaging spine, не смешивать с `Product.accountingType`.

---

## POS UX (зафиксировать до 4b)

### PIECE — обычный товар

```
Dior Sauvage 100ml  →  [Добавить]  →  Продажа
```

Без выбора флакона.

### WEIGHT — разлив

```
1. Выбрать аромат: Dior Sauvage
2. Количество: [10] мл
3. Доступная тара:
     ○ 5 ml
     ○ 10 ml   ← выбран
     ○ 30 ml
     ○ 50 ml
4. [Добавить в корзину]
5. Checkout
```

Если выбранного флакона нет на остатке магазина — **блокировка**, показать доступные варианты.

---

## Модель продажи (одна транзакция)

```
Sale
 ├── SaleItem
 │     product: Dior Sauvage (WEIGHT)
 │     qty: 10 ml
 │     salePrice: … (выручка только здесь)
 │     costPerUnit: FIFO liquid
 │
 └── SalePackagingUsage
       packagingSku: Bottle 10 ml
       qty: 1
       costPerUnit: FIFO bottle
```

**COGS** = liquid cost + bottle cost  

**P&L:**

```
Revenue − COGS − Expenses = Net Profit
```

---

## Аналитика (не «продажи флаконов»)

❌ **Неправильно:**

```
Продажи:
  Флакон 10 мл — 20 шт
```

✅ **Правильно — «Использование упаковки»:**

```
Магазин Душанбе

Флакон 5 мл:   40 шт
Флакон 10 мл:  25 шт
Стоимость упаковки: 43 сомони
```

Плюс: продано **мл** духов, COGS разлива (liquid vs packaging split).

---

## Фазы реализации Block 4

### 4a — Модель (без POS)

- `PackagingSku` + packaging batches + `StockBalance` (parallel spine или расширение location)
- Receive bottles (приход на склад)
- Transfer bottles (склад → магазин)
- Owner UI: список флаконов с остатками

**Критерий готовности:**

```
Owner видит:
  Флаконы:
    5 ml:  10000
    10 ml:  5000
    50 ml:  1000
```

**Без POS. Без изменений Seller catalog.**

---

### 4b — POS

- WEIGHT: ввод мл → выбор `PackagingSku` → корзина → checkout
- `createSale`: dual FIFO в одной `$transaction`
- Блок без флакона

**Критерий:** продажа 10 мл + флакон 10 мл списывает liquid −10, bottle −1, COGS верный.

---

### 4c — Аналитика

- Продано мл (WEIGHT)
- Использовано флаконов по SKU
- Стоимость упаковки (COGS packaging)
- COGS разлива (liquid + bottle)

**Не** включать packaging в top products / revenue by SKU.

---

### 4d — Возвраты и ревизии

**Отдельное решение до кодирования:**

| Сценарий | Вопрос |
|----------|--------|
| Полный возврат разлива | Восстанавливать liquid + bottle? |
| Частичный возврат мл | Какой флакон? |
| Открытый / использованный флакон | Списание или возврат на склад? |

Документировать policy → затем API + UI.

---

### 4e — Финальный E2E тест

Обязательный сценарий `test:packaging-e2e` (имя TBD):

```
Receive:
  1000 ml Dior
  100 bottles 10 ml

Transfer:
  300 ml + 30 bottles → Store

Sale:
  10 ml Dior + 1× bottle 10 ml

Assert:
  Liquid −10
  Bottle −1
  COGS = liquid FIFO + bottle FIFO
  Gross profit correct
  Analytics: ml sold, packaging usage (not bottle “sales”)
```

---

## Definition of Done (весь Block 4)

- [ ] Gate 1–8 подтверждён
- [ ] 4a: PackagingSku stock owner UI
- [ ] 4b: WEIGHT POS + dual FIFO sale
- [ ] 4c: Packaging usage analytics
- [ ] 4d: Return/revision policy + implementation
- [ ] 4e: E2E test PASS
- [ ] `test:seller-isolation` still PASS
- [ ] No `Dior *ml` products in seed/tests

---

## Запрет на старт

До явного **«разрешено Block 4»** от владельца продукта:

- не создавать миграции `PackagingSku`;
- не менять `createSale` / POS cart;
- не добавлять packaging в `getPosCatalog`.

Только документы и gate-review.
