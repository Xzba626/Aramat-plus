# Database schema — краткая шпаргалка

Полный документ: **[Database Design №6](database-design.md)**

## Инварианты

- Остаток = кэш; истина = **партии + движения**
- Себестоимость на **Batch**; цена продажи на **Product** + PriceHistory
- Партии не merge; списание **FIFO**
- SaleItem хранит snapshot price/cost
- Пароль только `password_hash`

## Основные сущности (Prisma сейчас)

`Company` · `User` · `Warehouse` · `Store` · `Category` · `Brand` · `Product` · `Batch` · `StockBalance` · `Transfer` · `Sale` · `SaleItem` · `DiscountRequest` · `GiftRule` · `SaleReturn` · `Expense` · `Notification` · `ActivityLog` · `Setting`

## К добавлению (v2)

`StockMovement` · `ProductImage` · `ProductBarcode` · `ReturnItem` · permissions / multi-store access · `mustChangePassword` · роль `WAREHOUSE_MANAGER`
