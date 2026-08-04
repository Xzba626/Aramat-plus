# Low-stock thresholds & card states

## Settings (source of truth)

**Настройки → Компания → «Пороги низкого остатка»**

| Key | Default | Use |
|-----|---------|-----|
| `warehousePiece` | 100 шт | Warehouse piece LOW |
| `storePiece` | 20 шт | Store piece LOW |
| `storeWeightMl` | 200 мл | WEIGHT products LOW (any location) |
| `bottlePiece` | 5 шт | Bottle notifications |

Stored in `Setting` key `lowStockThresholds`.

**Legacy (kept in DB):**
- `Product.minStock`, `Category.lowStockThreshold` — unused for LOW/OUT logic
- `Store.notifyLowStock` — **active**: when `false`, skip merchandise + bottle low-stock notifications for that store. Default `true`. Warehouse alerts are not gated by this flag.

## Warehouse vs store thresholds

| Surface | Threshold used |
|---------|----------------|
| Seller POS / store stock cards | `storePiece` / `storeWeightMl` |
| Owner POS (warehouse sell) / warehouse product status | `warehousePiece` (piece) or `storeWeightMl` (weight) |
| Notify after store sale | store thresholds + `notifyLowStock` |
| Notify after warehouse→store transfer (remaining at warehouse) | `warehousePiece` / weight threshold |

## Card states

1. **В наличии** (`OK`) — qty > threshold  
2. **Заканчивается** (`LOW`) — 0 < qty ≤ threshold (+ owner notification)  
3. **Нет в наличии** (`OUT`) — qty = 0; card stays visible; add-to-cart disabled  

Zero balances are returned from `getStoreStock` / POS warehouse `forPos=1`.

## End-to-end check (store)

1. Set store piece threshold = 20 (settings).  
2. Store has product with qty 25 → POS card «В наличии».  
3. Sell 6 → qty 19 → card «Заканчивается» + owner notification (if store `notifyLowStock` on).  
4. Sell to 0 → card remains, «Нет в наличии», tap does not add.  
5. Transfer/receive stock → card returns to «В наличии» or «Заканчивается» without recreating the product.  
6. Archive (product card → delete/archive) removes from active assortment; write-off only reduces warehouse qty.

## End-to-end check (warehouse)

1. Set warehouse piece threshold = 100.  
2. Central warehouse qty 120 → Owner POS / warehouse list «В наличии».  
3. Transfer out or owner-direct sale → qty 90 → «Заканчивается» + notification (uses **warehouse** threshold, not store 20).  
4. Down to 0 → «Нет в наличии», card stays (Owner POS `forPos=1`).  
5. Receive goods → status recovers automatically.
