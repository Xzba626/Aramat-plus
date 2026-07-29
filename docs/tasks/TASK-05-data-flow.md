# TASK — Fix ERP data flow (Warehouse → Store → POS → Sale)

**Статус:** Обязательно · приоритет над UI  
**Проект:** AROMAT PLUS ERP

> Не создавать новые «экраны ради экранов».  
> Цель: единая цепочка движения товара.

```
Central Warehouse → Transfer → Store Stock → Seller POS → Sale → ActivityLog / Analytics
```

## Инварианты

1. Product создаётся только на уровне компании (каталог склада).  
2. Batch никогда не merge.  
3. StockBalance привязан к `(productId, locationType, locationId)` где location = Warehouse.id или Store.id.  
4. Transfer: −WAREHOUSE FIFO · +STORE новая партия · ActivityLog.  
5. Seller POS читает **только** `LocationType.STORE` своего `storeId`.  
6. Sale: −остаток магазина (BRANCH) или склада (OWNER_DIRECT) · Sale + SaleItem · ActivityLog.

## API

| Метод | Путь | Назначение |
|-------|------|------------|
| POST | `/api/transfers` | Склад → филиал |
| GET | `/api/pos/catalog` | Каталог POS (seller) |
| POST | `/api/sales` | Продажа + списание FIFO |
| GET | `/api/sales` | История (seller = свои) |

## Тест

```bash
npx tsx scripts/test-stock-flow.ts
```

Сценарий: 100 на складе → transfer 20 → 80/20 → sale 5 → 80/15 + логи.

## Локальная разработка

localhost + PostgreSQL + Prisma. Vercel/Neon — после рабочей цепочки.
