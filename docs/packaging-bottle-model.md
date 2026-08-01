# Packaging / Bottle Model — обязательная спецификация

**Проект:** ARAMAT PLUS  
**Статус:** Утверждённый ориентир (не реализовано в коде)  
**Реализация:** [block-4-packaging-gate.md](block-4-packaging-gate.md)  
**Связь:** [Vision](vision.md) · [Architecture](architecture.md) · [Product Nomenclature](TZ-PRODUCT-NOMENCLATURE.md)

---

## Главная идея

**Флакон — готовая упаковочная единица (`PackagingSku`), не товар для продажи.**

| PackagingSku | Product |
|--------------|---------|
| Не продаётся | Продаётся в POS |
| Нет выручки | Есть `salePrice` |
| Не в Seller POS catalog | Store stock в POS |
| Только COGS | Liquid + packaging = COGS |
| Accounting: `PACKAGING` | `WEIGHT` / `PIECE` |

---

## Запрещено (жёстко)

Не создавать отдельные **Product** вида:

- `Dior Sauvage 5ml`
- `Dior Sauvage 10ml`
- `Dior Sauvage 50ml`

Флакон **не** Expense (аренда, ЗП). Только **COGS** продажи разлива.

---

## PackagingSku (целевая сущность)

Бизнесово это не «сырьё», а **готовая упаковочная SKU**.

Пример:

```
ID:       001
Название: Флакон стекло
Объём:    10 ml
Материал: Glass
Цвет:     Прозрачный
Крышка:   Black
Себестоимость (справочная): 0.80 сомони
Accounting: PACKAGING
```

| ✅ Есть | ❌ Нет |
|---------|--------|
| Склад, приход, FIFO | Продажа |
| Себестоимость на партии | `salePrice` |
| Остаток warehouse + stores | Выручка |
| Transfer в магазин | Строка в Seller POS catalog |

Партии и списание — **расширение** существующего FIFO-spine (`stock.service`), не замена.

---

## Product (жидкость / штучный товар)

**WEIGHT (разлив):** Dior Sauvage, остаток в мл, FIFO, `salePrice` за мл.

**PIECE:** Dior Sauvage 100ml (заводской), остаток в шт — **без** выбора флакона.

---

## Sale (одна DB transaction)

```
Sale
 ├── SaleItem          → жидкость, qty ml, revenue, FIFO liquid cost
 └── SalePackagingUsage → PackagingSku, qty 1, FIFO bottle cost (no revenue)
```

Пример COGS:

| | |
|-|-|
| Духи 10×2 сом | 20.00 |
| Флакон 10 мл | 0.80 |
| **COGS** | **20.80** |
| Выручка | 40.00 |
| **Валовая прибыль** | **19.20** |

```
Revenue − COGS − Expenses = Net Profit
```

---

## POS UX

### PIECE

`Товар → Добавить → Продажа` (без флакона).

### WEIGHT

`Аромат → [мл] → выбор тары (5/10/30/50 ml) → корзина → checkout`

WEIGHT **невозможен** без выбранного `PackagingSku` с остатком в магазине.

---

## Seller isolation

```
Warehouse → Transfer → Store Stock → Seller POS (только свой магазин)
```

- **Seller POS** — только store stock своего магазина.  
- **Owner Direct POS** — warehouse stock (отдельный канал, не для продавца).

`npm run test:seller-isolation`

---

## Аналитика

Раздел **«Использование упаковки»**, не «Продажи флаконов»:

- мл проданных духов;
- шт флаконов по SKU;
- стоимость упаковки (COGS).

---

## Roadmap (кратко)

См. [block-4-packaging-gate.md](block-4-packaging-gate.md):

| Фаза | Содержание |
|------|------------|
| **4a** | PackagingSku, stock, receive, transfer (без POS) |
| **4b** | WEIGHT POS + dual FIFO |
| **4c** | Аналитика упаковки |
| **4d** | Возвраты / ревизии (policy first) |
| **4e** | E2E test |

Block 4 — **до** Notifications, Inbox, CRM.
