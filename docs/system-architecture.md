# System Architecture Document №5

**Проект:** ARAMAT PLUS ERP  
**Версия:** 1.0  
**Статус:** Архитектурный ориентир перед Database Design и полной реализацией  
**Связанные документы:** [Vision](vision.md) · [UX](ux-specification.md) · [UI Design System](ui-design-system.md) · [API Architecture №10](api-architecture.md) · [Roadmap](roadmap.md)

---

## 1. Общая концепция архитектуры

Система создаётся как **многофилиальная онлайн ERP-платформа** для управления сетью магазинов.

Главная идея:

```
Центральный склад
        |
        ↓
Магазины (неограниченное количество)
        |
        ↓
Продавцы / Менеджеры / Кладовщики / Владелец
```

Все данные хранятся **централизованно**.  
Любое действие пользователя отражается во всей системе в соответствии с правами доступа и правилами транзакций.

Склад — **источник истины** для master-данных о товарах (Vision §6).

---

## 2. Тип приложения

**Формат: Web Application (PWA)**

- работает через браузер;
- открывается на компьютере (Owner Console);
- работает на телефоне (Seller POS — mobile-first);
- можно установить на смартфон как PWA;
- не требует публикации в Play Market / App Store для базового сценария.

Две UI-поверхности внутри одного frontend-приложения (см. UI Design System №4):

1. Owner Console  
2. Seller POS  

---

## 3. Архитектура высокого уровня

Трёхуровневая модель:

```
              Пользователь
                  |
            Frontend Layer
           (Next.js + React)
                  |
              API Layer
           (NestJS / BFF)
                  |
            Database Layer
         (PostgreSQL + Prisma)
                  |
            File Storage
         (S3 / Cloudinary)
```

Дополнительно:

- **Realtime** — WebSocket (уведомления, обновления остатков);
- **Audit** — неизменяемый журнал действий;
- **RBAC** — на каждом запросе API.

---

## 4. Frontend (клиентская часть)

### Стек

| Технология | Назначение |
|------------|------------|
| Next.js (App Router) | Routing, SSR/CSR, PWA shell |
| React | UI |
| TypeScript | Типобезопасность |
| Tailwind CSS | Стили по Design System |
| React Hook Form + Zod | Формы и валидация |
| Zustand | Клиентское состояние (корзина POS) |

### Frontend отвечает за

- интерфейс владельца / менеджера / кладовщика;
- интерфейс продавца (POS);
- формы, таблицы, графики, поиск;
- корзину (клиентское состояние + commit на сервер);
- отображение уведомлений;
- **не** содержит бизнес-правил остатков, партий, прибыли.

### Принцип

Frontend общается **только через публичный API**.  
Прямого доступа к БД нет.

---

## 5. Backend (серверная часть)

### Целевой стек (рекомендация документа №5)

| Слой | Технология |
|------|------------|
| Frontend | Next.js + React + TypeScript |
| Backend | **NestJS + TypeScript** |
| Database | PostgreSQL |
| ORM | Prisma |
| Auth | JWT + Refresh Token |
| Realtime | WebSocket (NestJS Gateway) |
| Files | Cloudinary / S3 |

### Почему отдельный NestJS

В системе ожидаются:

- много магазинов и пользователей;
- история операций и аудит;
- аналитика и финансовые расчёты;
- сложный RBAC;
- realtime-уведомления;
- долгосрочное развитие и возможные интеграции.

Отдельный backend проще масштабировать, тестировать и выносить в отдельные сервисы при росте.

### Фазовый переход (важно для текущего репозитория)

| Фаза | Backend | Состояние |
|------|---------|-----------|
| **Phase A (Milestone 1)** | Next.js Route Handlers + `src/lib/services/*` | Реализовано сейчас |
| **Phase B** | Выделение NestJS, те же контракты API | Планируется |

Service layer в Phase A проектируется так, чтобы перенос в NestJS modules **не требовал переписывания frontend**.

Контракт API (REST/JSON) стабилен между фазами.

---

## 6. База данных

**PostgreSQL**

Подходит для:

- финансовых данных и точных `DECIMAL`;
- складского учёта и транзакций;
- истории / аудита;
- аналитических запросов;
- конкурентного доступа с транзакциями (`SELECT … FOR UPDATE` / Prisma `$transaction`).

Размещение (варианты): Neon · Supabase · AWS RDS.

---

## 7. ORM

**Prisma**

- типобезопасные запросы;
- миграции;
- единая схема для Phase A и Phase B;
- генерация клиента для NestJS и Next.js.

Схема — единый источник истины: `prisma/schema.prisma` (детализация в документе №6).

---

## 8. Размещение системы (Deployment)

| Компонент | Варианты |
|-----------|----------|
| Frontend | Vercel |
| Backend (NestJS) | Railway · Render · AWS · DigitalOcean |
| Database | Neon · Supabase · AWS RDS |
| Files | Cloudinary · S3 |
| Phase A (монолит Next) | Vercel + Neon (текущий путь) |

Переменные окружения: `DATABASE_URL`, `AUTH_SECRET` / JWT secrets, `STORAGE_*`, `REDIS_URL` (опционально для сессий/очередей).

---

## 9. Структура репозитория (целевая)

```
aramat-plus/
├── apps/
│   ├── web/                 # Next.js frontend (+ Phase A API при необходимости)
│   └── api/                 # NestJS backend (Phase B)
├── packages/
│   ├── database/            # Prisma schema, migrations, seed
│   ├── shared/              # Zod DTO, типы, константы ролей
│   └── ui/                  # опционально: shared UI kit
├── docs/                    # documentation/
└── README.md
```

Упрощённый вид (как в исходном черновике):

```
aramat-plus/
├── frontend/          # Next.js
├── backend/           # NestJS
├── database/          # Prisma
└── documentation/
```

**Сейчас (Phase A):** монорепозиторий Next.js с `src/app`, `src/lib/services`, `prisma/` — с последующим выносом в структуру выше.

---

## 10. Основные модули системы

### Auth Module

- вход / выход;
- временный пароль + обязательная смена;
- сброс пароля владельцем (без просмотра старого);
- JWT access + refresh (целевой);
- RBAC.

Роли:

```
OWNER
MANAGER
WAREHOUSE_MANAGER
SELLER
```

### User Module

Управление сотрудниками, привязка к магазину / складу, деактивация.

### Product Module

Категории, бренды, товары, фото, штрих-коды, артикулы, внутренний ID (`AR-000001`).

### Warehouse Module

Поступление, **партии (без merge)**, остатки, FIFO при списании.

### Store Module

Филиалы без лимита количества; история на уровне магазина.

### Transfer Module

Склад → магазин (транзакция + аудит).

### Sales Module

Корзина, продажа, скидки (approval), подарки, snapshot цены/себестоимости.

### Return Module

```
Продавец → запрос → Владелец → подтверждение → остатки + аналитика + история
```

### Analytics Module

Продажи, прибыль, расходы, топы, периоды, фильтр по магазину / сети.

### Notification Module

Низкий остаток, скидки, возвраты, ревизии, поставки.

### Audit Module

Самый важный сквозной модуль:

```
Кто?  Когда?  Что сделал?  Где?  Результат?
```

Пример:

```
10.08.2026 15:20 | OWNER
Изменил цену | Dior Sauvage | 150 → 170 сомони
```

Ни одно изменение критичных данных не выполняется без записи в Audit.

---

## 11. Реальное время (Realtime)

**WebSocket** (NestJS Gateway / Phase A: Server-Sent Events или polling как временный вариант).

Примеры событий:

- `stock.updated` — после перемещения / продажи;
- `discount.request` / `discount.resolved`;
- `return.request` / `return.resolved`;
- `notification.created`.

Правило: UI продавца и владельца не требует ручного F5 для статусов скидки.

---

## 12. Поиск и идентификация товаров

### Решение: комбинированная идентификация

| Поле | Пример | Назначение |
|------|--------|------------|
| Внутренний ID | `AR-000001` | Человекочитаемый код |
| Артикул (SKU) | настраиваемый | Учёт / поставщики |
| Штрих-код | генерируется системой | Сканер / камера телефона |
| Название / бренд / категория | текст | Ручной поиск |

Поиск на POS работает **одновременно** по всем полям.

Почему не только порядковый номер: ошибки, неудобство сканеров, плохая масштабируемость.  
Штрих-код + внутренний ID + название — профессиональный стандарт для сети магазинов.

---

## 13. Работа с партиями (Batch)

**Нельзя** просто «менять остаток» без партии.

```
Product: Dior Sauvage

Batch 1 | 01.08.2026 | cost 100 | qty 50
Batch 2 | 10.08.2026 | cost 120 | qty 100
```

Правила:

- партии **не объединяются**;
- списание — **FIFO** (продажа, перемещение);
- цена продажи хранится на Product; себестоимость — на Batch;
- в SaleItem — snapshot `salePrice` + `costPerUnit` + `batchId`.

Детали — в документе №6 (Database Design) и `docs/batch-rules.md`.

---

## 14. Безопасность

| Механизм | Описание |
|----------|----------|
| Authentication | JWT + Refresh (целевой); сессии Auth.js допустимы в Phase A |
| Authorization | RBAC на каждом endpoint |
| Passwords | bcrypt/argon2 hash; владелец не видит пароль; только reset |
| Transport | HTTPS only |
| Audit | полный журнал действий |
| Data isolation | `companyId` (мультитенантность / white-label) |
| Seller isolation | API не отдаёт cost/profit поля роли SELLER |
| Dangerous ops | подтверждение + аудит |

---

## 15. Масштабирование

Проектируем сразу на рост:

| Сейчас | Через годы |
|--------|------------|
| 1 склад | несколько складов (на компанию) |
| ~8 магазинов | 100+ магазинов |
| ~50 сотрудников | 1000+ сотрудников |

Средства:

- индексы БД по `companyId`, location, датам;
- пагинация всех списков;
- транзакции для остатков;
- горизонтальное масштабирование NestJS (stateless JWT);
- вынос тяжёлой аналитики в read-модели / материализованные отчёты при необходимости;
- очередь задач (опционально) для уведомлений и экспорта.

Архитектура frontend **не меняется** при добавлении магазина — только данные.

---

## 16. Что нельзя делать

- ❌ чистый HTML/CSS как основа коммерческой системы;
- ❌ хранение учётных данных только в браузере / localStorage как «БД»;
- ❌ один монолитный JS-файл без модулей;
- ❌ прямой доступ frontend → database;
- ❌ изменение остатков/цен/продаж **без истории**;
- ❌ merge партий с потерей себестоимости;
- ❌ показ себестоимости и прибыли продавцу.

---

## 17. Итоговая схема (целевая)

```
                 Пользователь
                      |
              Next.js + React (PWA)
                      |
                   REST API
                  (+ WebSocket)
                      |
                   NestJS
                      |
                 Prisma ORM
                      |
                 PostgreSQL
                      |
              Object Storage (фото)
```

---

## 18. Итоговый стек (утверждённый ориентир)

### Frontend

- Next.js · React · TypeScript · Tailwind CSS

### Backend

- NestJS · TypeScript  
- (Phase A: Next.js API Routes + services → миграция в NestJS)

### Database

- PostgreSQL · Prisma

### Authentication

- JWT + Refresh Token (целевой)  
- Phase A: Auth.js credentials + session/JWT

### Realtime

- WebSocket

### Storage

- Cloudinary / S3 (фото товаров, аватары)

### Deployment

- Vercel (web) + Railway/Render (api) + Neon (db)  
- Phase A: Vercel + Neon

---

## 19. Потоки данных (примеры)

### Перемещение склада → магазин

```
UI → POST /transfers
  → RBAC (OWNER | WAREHOUSE_MANAGER)
  → Transaction:
       FIFO deduct warehouse batches
       create store batches (same cost)
       update stock balances
       write Transfer + Audit
  → emit stock.updated (WebSocket)
  → response
```

### Продажа

```
UI (Seller) → POST /sales
  → RBAC (SELLER, storeId match)
  → Transaction:
       FIFO deduct store batches
       create Sale + SaleItems (snapshots)
       gifts / approved discount
       Audit
  → analytics side-effects
  → emit stock.updated
```

### Запрос скидки

```
Seller → POST /discount-requests
Owner  ← notification + WebSocket
Owner  → approve/reject
Seller ← status update (realtime)
Sale   → uses approved price for this cart only
```

---

## 20. Соответствие документам

| Документ | Как отражается в архитектуре |
|----------|------------------------------|
| Vision | Центральный склад, масштаб, white-label (`companyId`) |
| UX | Две поверхности UI, RBAC видимости данных |
| UI DS | Токены и компоненты только во frontend |
| Roadmap | Порядок модулей; NestJS как этап выноса |

---

## 21. Следующий документ

**№6 — Database Design (Схема базы данных)**

Чертёж БД:

- все таблицы и поля;
- связи;
- партии и остатки;
- магазины, пользователи, продажи;
- скидки, возвраты;
- аналитические поля / индексы;
- история действий.

Без №6 нельзя уверенно писать Prisma-миграции «навсегда».

---

## Итог

ARAMAT PLUS ERP — **PWA + централизованная PostgreSQL ERP** с чётким разделением Frontend / API / Database.

Целевой backend — **NestJS**; текущий Milestone 1 допустим на Next.js API при условии изолированного service layer и стабильных контрактов.

Ключевые архитектурные инварианты:

1. Склад = master data  
2. Партии раздельные + FIFO  
3. Audit на каждое значимое действие  
4. RBAC + seller data isolation  
5. Масштаб магазинов без смены кода  
6. Путь к NestJS без переписывания UI
