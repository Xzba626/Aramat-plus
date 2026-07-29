# Frontend Architecture Document №11

**Проект:** ARAMAT PLUS ERP  
**Версия:** 1.0  
**Статус:** Архитектура Frontend (Next.js + React + TypeScript)  
**Связанные документы:** [Vision §21](vision.md) · [UI Blueprint №13](ui-blueprint.md) · [PWA & Multi-Surface №14](pwa-multi-surface.md) · [UI Design System №4](ui-design-system.md) · [Roadmap №12](roadmap.md)

> Это не лендинг, а **операционная система сети магазинов** (PWA).  
> Три поверхности: **Owner Desktop · Owner Mobile · Seller POS** — см. [№14](pwa-multi-surface.md).

---

## 1. Главная идея Frontend

| Требование | Решение |
|------------|---------|
| Компьютер + планшет + телефон | Owner — desktop-first + mobile; Seller — **mobile-first** |
| Быстрый интерфейс | Крупные CTA, минимум экранов у продавца, пагинация у владельца |
| Разные UI по ролям | Route groups `(owner)` / `(seller)` |
| Единый дизайн | Design System №4 + CSS tokens |
| Другие клиенты | `Company` + theme settings, без хардкода бренда в логике |

---

## 2. Общая структура приложения

```
                 APP (Next.js)
                      |
        -----------------------------
        |                           |
   OWNER PANEL                 SELLER PANEL
   (Console)                   (POS)
        |                           |
        ------------+----------------
                    |
              COMPONENTS (ui + features)
                    |
              services / API client
                    |
              Backend API → Database
```

Один frontend-монолит, два shell’а, один backend.

---

## 3. Технологический стек Frontend

| Слой | Технология |
|------|------------|
| Framework | Next.js (App Router) |
| Язык | TypeScript |
| Стили | Tailwind CSS + UI-примитивы (shadcn-стиль) |
| Иконки | Lucide React (целевой стандарт; emoji в nav — временно) |
| Формы | React Hook Form |
| Валидация | Zod (`src/lib/validators`) |
| Состояние UI | React Context (сессия, тема) |
| Состояние бизнеса на клиенте | **Zustand** (корзина продавца) |
| Auth UI | Auth.js / NextAuth session |

---

## 4. Структура проекта

### Целевая (рекомендуемая)

```
src/
├── app/
│   ├── login/
│   ├── (owner)/          # Owner Console shell
│   │   ├── dashboard/
│   │   ├── analytics/
│   │   ├── warehouse/
│   │   ├── stores/
│   │   ├── sellers/      # users
│   │   ├── transfers/
│   │   ├── history/
│   │   ├── revision/
│   │   └── settings/
│   ├── (seller)/         # Seller POS shell
│   │   ├── pos/          # /pos или /seller
│   │   ├── cart/
│   │   ├── history/
│   │   └── profile/
│   └── api/              # Phase A API Routes
├── components/
│   ├── ui/               # Button, Modal, Input, Table…
│   ├── layout/           # OwnerShell, SellerNav…
│   └── features/         # ProductCard, SaleCart…
├── features/             # опционально: feature-folders
├── hooks/
├── lib/
│   ├── services/         # server business logic
│   ├── validators/
│   └── api.ts            # client fetch helpers
├── stores/               # Zustand (cart)
├── types/
└── utils/
```

### Фактически сейчас (Phase A)

Уже есть: `(owner)/*`, `(seller)/pos`, `components/ui`, `components/layout`, `lib/services`, `lib/api.ts`, `middleware.ts`.

Дорастить: `stores/cart`, feature-компоненты POS, полноценный `/seller/*`, Lucide вместо emoji в nav.

---

## 5. Разделение по ролям

### OWNER (и Manager с урезанным меню)

**Устройства:** компьютер + телефон.  
**Shell:** тёмный sidebar 260px + светлая рабочая область (№4).

Меню (канон — UI Blueprint №13):

```
Главная · Продажи · Склад · Магазины · Товары
Перемещения · Возвраты · Ревизии · Аналитика
История · Пользователи · Настройки
── Уведомления · Профиль · Выход
```

### SELLER

**Устройство:** телефон (основной сценарий).  
**Shell:** bottom navigation — **ровно 5 пунктов**:

```
Продажа · История · Корзина · Уведомления · Профиль
```

Seller **не видит** себестоимость, прибыль, аналитику сети, чужие магазины.

---

## 6. Экран входа

**URL:** `/login`

Содержимое: логотип · логин · пароль · «Войти».

После успешного входа:

| Роль | Редирект |
|------|----------|
| OWNER / MANAGER | `/dashboard` |
| SELLER | `/pos` (алиас `/seller` допустим) |
| WAREHOUSE* | складской раздел (когда роль включена) |

Если `mustChangePassword` → экран смены пароля до доступа к системе.

---

## 7. Owner Dashboard

**URL:** `/dashboard`

Карточки сверху (KPI):

- продажи сегодня (сомони);
- прибыль сегодня;
- количество продаж;
- проблемные / заканчивающиеся товары.

Данные: `GET /api/analytics/dashboard` + notifications.  
Шесть блоков layout — см. UI DS №4 / текущий dashboard.

---

## 8. Аналитика

**URL:** `/analytics`

1. Период: Сегодня · Неделя · Месяц · Год · Свой диапазон.  
2. Контекст: Все магазины / конкретный магазин.  
3. Внутри: выручка · себестоимость · расходы · скидки · чистая прибыль · топ товаров · топ продавцов.

Только Owner/Manager. Seller → нет пункта меню.

---

## 9. Склад

**URL:** `/warehouse`

Таблица / список: товар · категория · бренд · партии · количество · цена закупки · цена продажи.

Действия: «+ Добавить товар» · Изменить · Переместить · История.

Карточка товара: `/warehouse/[id]` или `/products/[id]` (один канонический URL — не дублировать логику).

---

## 10. Карточка товара

Показ:

- название, фото, категория, тип, штрих-код(ы);
- **партии отдельно** (не суммировать закупочные цены в одну «среднюю» для учёта);
- для каждой партии: дата/метка · qty · себестоимость · (sale price — на уровне Product / PriceHistory).

Seller на POS видит только: имя · цена продажи · доступное qty своего магазина.

---

## 11. Магазины

**URL:** `/stores` → `/stores/[id]`

Список магазинов. Внутри вкладки / секции:

Информация · Сотрудники · Остатки · Продажи · Возвраты · История · Расходы · Аналитика.

---

## 12. Пользователи

**URL:** `/sellers` (или `/users` — синоним в IA)

Форма создания: имя · роль · магазин · логин · временный пароль (или «Сгенерировать»).

Роли UI: Владелец · Менеджер · Продавец (+ Кладовщик по схеме).

**Важно:** после сохранения пароль владельцу **не показывается**. Только «Сбросить пароль».

---

## 13. История

**URL:** `/history`

Не одна огромная таблица. Разделы / фильтры:

- продажи;
- возвраты;
- пользователи;
- склад / перемещения;
- цены;
- прочие изменения (audit).

Пример строки: дата · кто · действие · было / стало.

---

## 14–18. Seller POS

### Главная цель

Продажа за несколько секунд.

**URL:** `/pos` (главная продавца).

### Экран продажи

- крупный поиск сверху (название / штрих-код / QR);
- результаты: имя · цена · «есть N шт»;
- «Добавить» → Zustand cart.

### Корзина

```
Dior Sauvage   1 × 150
Часы           1 × 300
Итого: 450 сомони
[ Продать ]  [ Запросить скидку ]
```

«Продать» → `POST /api/sales`. Корзина только на клиенте до подтверждения.

### Скидка

Модалка: текущий итог → желаемая сумма → отправить.  
После approve (realtime / poll): обновить сумму в корзине → «Продать».

### Подарки

Ответ API / check promotions → баннер «Покупателю положен: …».

---

## 19. Профиль продавца

**URL:** `/seller/profile` или `/pos/profile`

| Может | Не может |
|-------|----------|
| Сменить **пароль** | Видеть чужие пароли |
| Язык / фото (по UX) | Менять **логин** самостоятельно |
| Имя — по политике компании* | Себестоимость / аналитика |

> **Уточнение vs черновик №11:** логин меняет только Owner (UX Spec №3 §20). Черновик «изменить логин» продавцом **не принимаем**.

Владелец пароль сотрудника никогда не «смотрит» — только reset.

---

## 20. Mobile First для продавца

- кнопки ≥ 44px;
- поиск сверху;
- минимум текста;
- bottom nav одной рукой:

```
Продажа · Товары · Корзина · История · Профиль
```

Owner на телефоне: drawer sidebar + ключевые пункты, таблицы с горизонтальным скроллом / упрощёнными списками.

---

## 21. Дизайн (согласование с №4)

| Токен | Значение | Где |
|-------|----------|-----|
| Фон контента | `#FFFFFF` / page `#F4F5F7` | Рабочая область |
| Текст | `#1A1C21` / `#1F2937` | Основной |
| Бренд | `#C41E3A` | CTA, логотип, важные действия — **не везде** |
| Прибыль | `#1F9D63` (зелёный) | `+6200 сомони` |
| Расход / опасность | `#DC2626` | `-1500 сомони` |
| Ожидание | warning orange | скидки / low stock |

**Золотой:** только редкий декоративный акцент бренда (не основной CTA). В DS №4 золото **не** заменяет красный бренд.

Источник правды по цветам: **[UI Design System №4](ui-design-system.md)**.

---

## 22. Компоненты

### Общие (`components/ui`)

Button · Modal · Table · Card · Input · Select · Search · Badge · Dropdown · Chart · PageHeader

### Бизнес (`components/features` или `features/*`)

ProductCard · StockTable · SaleCart · DiscountModal · TransferForm · AnalyticsCard · HistoryList · GiftBanner

Правило: страницы собирают фичи; фичи вызывают `services` / `lib/api`, не сырой `fetch` размазанный по JSX.

---

## 23. Работа с API на клиенте

Слой клиента:

```
lib/api.ts              # base fetch + errors
# или
services/products.ts    # getProducts, createProduct, updateProduct
services/sales.ts
…
```

Страницы и компоненты **не** дублируют URL и заголовки авторизации вручную в каждом месте.

Server Components могут вызывать `lib/services/*` напрямую (Phase A); Client Components — только через HTTP API / Server Actions.

---

## 24. Производительность

Обязательно:

- пагинация / cursor для таблиц склада и истории;
- поиск товаров через backend (`/products/search`);
- `next/image` для фото;
- не тянуть весь каталог в корзину;
- кеш React Query / SWR (рекомендуется) или revalidate для RSC;
- skeleton / empty states вместо «пустого белого экрана».

---

## 25. PWA

Обязательный формат доставки — см. **[PWA & Multi-Surface №14](pwa-multi-surface.md)**.

- `manifest` + icons из Company;  
- standalone;  
- продавец ставит на домашний экран;  
- offline shell v1; полные offline-продажи — не в v1.

### Три UI в одном проекте

Не адаптировать Desktop «в лоб». Отдельно проектировать:

1. Owner Desktop  
2. Owner Mobile  
3. Seller POS  

### Фаза UI-first

До наращивания Milestone 2 логики — каркасы всех экранов и shells по Blueprint + №14.

---

## 26. Будущее

Та же архитектура позволит:

- React Native client на тех же API;
- multi-company / франшиза;
- онлайн-витрина;
- CRM и лояльность;

без переписывания Owner/Seller shells с нуля — при условии изоляции бренда в settings.

---

## 27. Соответствие репозиторию

| №11 | Сейчас |
|-----|--------|
| Owner shell + sidebar | ✅ |
| Seller POS layout | ✅ stub `/pos` |
| Login + role redirect | ✅ |
| Dashboard KPI blocks | ✅ |
| Warehouse / stores / sellers / transfers | ✅ |
| Analytics / history / revision UI | ⏳ stubs / soon |
| Cart Zustand + full POS | ⏳ |
| services client layer | частично (`lib/api`) |
| PWA | ⏳ |
| Lucide icons | ⏳ |

---

## Итог

Frontend = **два продукта в одном приложении**:

| | Owner ERP | Seller POS |
|--|-----------|------------|
| Цель | управление бизнесом | быстрая продажа |
| Устройство | ПК + телефон | телефон |
| Nav | sidebar | bottom bar |
| Данные | полный доступ по роли | без cost / analytics |

Общие: Design System, types, API contracts, `Company` theme.

Архитектура сразу как коммерческий продукт, не как временный прототип.

---

## Следующий документ

**№12 — DEVELOPMENT ROADMAP** — полный план: [`roadmap.md`](roadmap.md).

