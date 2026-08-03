# Wave G — Product photo chain certification

## Root cause

Owner uploads save to `Product.imageUrl`, but:

1. **POS catalog** (`pos-catalog.service.ts`) exposed only `brand.imageUrl`, not the product photo.
2. **Store stock API** mapped `imageUrl: brand?.imageUrl`.
3. **POS UI** rendered a letter placeholder and never used an image field.
4. **Warehouse catalog** used emoji placeholders instead of `product.imageUrl`.

Transfer does not strip photos — the field was simply never threaded through to seller-facing DTOs/UI.

## Fix

- `resolveProductImageUrl()` — product photo first, brand logo fallback
- POS catalog + store stock return product `imageUrl`
- Shared `ProductCard` / `ProductThumb` on warehouse, transfers, POS, store stock, cart
- Proof: `npx tsx scripts/zt-photo-chain-proof.ts` → `tmp/wave-g-photo-chain.json`

## Scoreboard

```text
Создание товара — PASS
Загрузка фотографии — PASS
Сохранение изображения — PASS
API передачи изображения — PASS
Карточки склада — PASS
Отправка в магазины — PASS
Каталог продавца (POS) — PASS
Мобильная версия — PASS
Desktop версия — PASS
Полная цепочка фотографии товара — PASS
```
