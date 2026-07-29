# Architecture — краткая шпаргалка

Полный документ: **[System Architecture №5](system-architecture.md)**

## Целевой стек

```
Next.js (PWA) → NestJS API → Prisma → PostgreSQL
                ↘ WebSocket
                ↘ S3/Cloudinary
```

## Phase A (сейчас)

Next.js App Router + Route Handlers + `src/lib/services/*` + Prisma + Auth.js  
→ контракты API совместимы с будущим NestJS.

## Инварианты

- Центральный склад = master data  
- Партии не merge, списание FIFO  
- Audit log обязателен  
- Seller не получает cost/profit  
- `companyId` для multi-tenant / white-label
