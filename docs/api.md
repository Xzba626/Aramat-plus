# API — краткая шпаргалка

Полный контракт эндпоинтов: **[API Design №7](api-design.md)**  
Архитектура слоя API: **[API Architecture №10](api-architecture.md)**

## База

- JSON · `/api/v1` (целевой) · сейчас Phase A: `/api/...`
- Auth: Bearer JWT (+ Refresh) / Phase A: Auth.js session
- Ошибки: `{ "error": "..." }`

## Ресурсы

`/auth` `/users` `/stores` `/products` `/batches` `/warehouse` `/transfers` `/sales` `/discount-requests` `/promotions` `/returns` `/analytics` `/expenses` `/notifications` `/audit`

## Инварианты

- SELLER не получает cost/profit
- Price change → history, не трогает старые продажи
- Transfer/Sale → transaction + FIFO + audit
- Пароль: только hash; owner reset, не read
