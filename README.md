# Aromat Plus ERP / ARAMAT PLUS ERP

Коммерческая ERP-система для сети парфюмерных магазинов (Таджикистан).

## Документы

1. **[MASTER](docs/MASTER.md)** — управляющий порядок разработки
2. **[FOUNDATION CYCLE](docs/FOUNDATION-CYCLE.md)** — один цикл Склад→Магазин→Продажа (текущий фокус)
3. **[LOCAL DEV](docs/LOCAL-DEV.md)** — Docker Postgres + localhost (без Vercel)
4. **[AUDIT 2026-07-28](docs/AUDIT-2026-07-28.md)** — аудит: работает / UI-only / отсутствует
5. **[Vision](docs/vision.md)** — что создаём и зачем (№1)
5. **[UX Specification](docs/ux-specification.md)** — как пользователь работает (№3)
6. **[UI Design System](docs/ui-design-system.md)** — визуальный стиль (№4)
5. **[System Architecture](docs/system-architecture.md)** — как устроена система (№5)
6. **[Database Design](docs/database-design.md)** — полная схема БД (№6)
7. **[API Design](docs/api-design.md)** — Frontend ↔ Backend (№7)
8. **[User Flows](docs/user-flows.md)** — сценарии пользователей (№8)
9. Business Process Specification (BPS) — (рекомендуется)
10. **[API Architecture](docs/api-architecture.md)** — слой API и принципы (№10)
11. **[Frontend Architecture](docs/frontend-architecture.md)** — Owner Console + Seller POS (№11)
12. **[Development Roadmap](docs/roadmap.md)** — порядок модулей (№12)
13. **[UI Blueprint](docs/ui-blueprint.md)** — экран за экраном (№13)
14. **[Owner Dashboard](docs/dashboard-owner.md)** — Главная владельца (№13.1)
15. **[PWA & Multi-Surface](docs/pwa-multi-surface.md)** — PWA + 3 UI + white-label (№14)
16. **[Торговые точки №15](docs/stores-module.md)** — обязательное ТЗ v2.0
17. **[TASK 01 Desktop UI](docs/tasks/TASK-01-desktop-ui.md)** — архитектура Owner Desktop (обязательно)
18. **[TASK 02 Warehouse](docs/tasks/TASK-02-warehouse.md)** — ядро системы (обязательно)
19. **[TASK 03 Seller POS](docs/tasks/TASK-03-pos.md)** — мобильный POS (ТЗ; live sale — следующий этап после Магазинов)
20. **[TASK 04 Магазины](docs/tasks/TASK-04-stores.md)** — Owner Desktop HQ сети (текущий этап)
21. [IA Three Centers](docs/ia-three-centers.md) — три центра управления
22. **[Центральный склад](docs/warehouse-central.md)** — единый источник данных (№16)
23. **[Owner Direct Sales](docs/owner-direct-sales.md)** — личные продажи владельца (№17)
24. [Architecture (кратко)](docs/architecture.md)
25. [Design tokens](docs/design-system.md)
26. [Database notes](docs/database-schema.md)
27. [RBAC](docs/rbac.md)
28. [Batch rules](docs/batch-rules.md)
29. [API (кратко)](docs/api.md)

## Стек

Next.js 16 · TypeScript · Tailwind CSS · Prisma · PostgreSQL · Auth.js

## Быстрый старт (локально, без Vercel)

1. Установите [Docker Desktop](https://www.docker.com/products/docker-desktop/) и дождитесь запуска
2. `npm install`
3. Скопируйте `.env.example` → `.env`, задайте `AUTH_SECRET`
4. `npm run db:up` — PostgreSQL в Docker
5. `npx prisma db push && npm run db:seed`
6. `npm run smoke:cycle` — проверка цикла Склад→Магазин→Продажа
7. `npm run dev` → http://localhost:3000

Подробнее: [docs/LOCAL-DEV.md](docs/LOCAL-DEV.md)

## База данных

Рекомендуется Docker Compose:

```bash
npm run db:up
# DATABASE_URL=postgresql://aromat:aromat@localhost:5432/aromat_plus?schema=public
npx prisma db push
npm run db:seed
```

Остановка: `npm run db:down`

### Демо-аккаунты

| Роль | Email | Пароль |
|------|-------|--------|
| Owner | owner@aromat.plus | owner1234 |
| Manager | manager@aromat.plus | manager1234 |
| Seller | seller@aromat.plus | seller1234 |

## Milestone 1 (этапы 1–10)

- Полная схема БД (включая будущие модули)
- Auth + RBAC (Owner / Manager / Seller)
- Справочники, склад, партии (без merge), магазины, перемещения FIFO
- Owner UI (mobile-first, тёмная тема)
- Seller POS — заглушка

Тесты: `npm run test:milestone1`

## Документация

- [docs/architecture.md](docs/architecture.md)
- [docs/database-schema.md](docs/database-schema.md)
- [docs/batch-rules.md](docs/batch-rules.md)
- [docs/rbac.md](docs/rbac.md)
- [docs/api.md](docs/api.md)

## Git

После установки Git:

```bash
git init
git add .
git commit -m "Initial commit: Aromat Plus ERP milestone 1"
```
