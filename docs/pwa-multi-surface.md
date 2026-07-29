# PWA & Multi-Surface UI — Document №14

**Проект:** AROMAT PLUS ERP  
**Версия:** 1.0  
**Статус:** Стратегия доставки и поверхностей интерфейса  
**Связанные документы:** [Vision §21](vision.md) · [UI Blueprint №13](ui-blueprint.md) · [Frontend №11](frontend-architecture.md) · [UI Design System №4](ui-design-system.md) · [Roadmap №12](roadmap.md)

---

## 1. Решение: PWA, не отдельное native-приложение

Система доставляется как **Progressive Web App**.

Для пользователя это выглядит как настоящее приложение:

| Свойство | Да |
|----------|-----|
| Без адресной строки (standalone) | ✅ |
| «Добавить на главный экран» | ✅ |
| Иконка компании (Aromat Plus / client brand) | ✅ |
| Запуск как приложение | ✅ |
| Android · iPhone · планшет · компьютер | ✅ |
| **Одна кодовая база** | ✅ |

Владельцу **не** нужно ставить разные приложения из магазинов.  
Отдельный React Native / Flutter — опция будущего на тех же API, не сейчас.

---

## 2. Архитектура продукта (логически 4 зоны, физически 1 проект)

```
Aromat Plus ERP (один Next.js проект)

├── Web Desktop (владелец)     — sidebar, таблицы, графики
├── Web Mobile (владелец)      — bottom/drawer, карточки
├── Mobile POS (продавец)      — поиск → корзина → продать
└── Backend                    — API Routes / services / Prisma
```

Это **не четыре репозитория**.

Один app выбирает shell по:

1. **роли** (Owner / Manager / Seller / …);  
2. **устройству / breakpoint** (desktop vs mobile для Owner).

```
role + viewport  →  Surface
```

| Роль | Desktop | Mobile phone |
|------|---------|--------------|
| Owner / Manager | **Owner Desktop Console** | **Owner Mobile Console** |
| Seller | не целевой (опц. узкий POS) | **Seller POS** |

---

## 3. Главное правило UI (Shopify / Stripe / Notion-подход)

### ❌ Не делать

«Сжать Desktop в узкую колонку» и назвать это mobile.

### ✅ Делать

**Две разные версии Owner UI**, плюс отдельный Seller:

| Surface | Проектируется | Nav | Плотность |
|---------|---------------|-----|-----------|
| Owner Desktop | отдельно | Sidebar 260px | таблицы, много колонок |
| Owner Mobile | отдельно | ☰ + sidebar (без bottom tabs) | **карточки** |
| Seller POS | отдельно | Bottom 5 | крупные тач-цели, минимум текста |

Общие: токены Design System, компоненты-примитивы, API, типы.  
Разные: layout, IA навигации, представление списков (table vs card).

---

## 4. Что видит владелец

### Desktop

```
Sidebar · Dashboard · Таблицы · Графики · Полная аналитика
```

Максимум информации на одном экране. См. Blueprint §A.

### Mobile (владелец)

☰ открывает полный sidebar.  
**Нижний tab bar Owner не используется** ([Dashboard №13.1](dashboard-owner.md)).  
Списки — карточки; детали — отдельный экран.

---

## 5. Что видит продавец

**Нет Dashboard.** Сразу POS:

```
Поиск → товары → корзина → Продать
```

Не показывать: аналитику, прибыль, себестоимость, расходы, склады сети, настройки справочников.

Пять пунктов nav — Blueprint §B-00.

---

## 6. Фаза «идеальный UI» (сейчас приоритет)

**Пауза на наращивание бизнес-фич** до фиксации UI.

Порядок проектирования / реализации UI:

1. Общий Layout (Desktop + Mobile Owner + Seller) + PWA shell  
2. Панель владельца (оба viewport)  
3. Панель продавца  
4. Все пункты меню / экраны разделов (каркас)  
5. Все страницы (empty + структура)  
6. Все модальные окна  
7. Все формы  
8. Все таблицы / card-lists  
9. Все сценарии (happy path UI walkthrough)  

**Только после этого** — глубокая логика модулей Milestone 2+ (продажи, скидки…).

Исключение: уже работающие API склада/магазинов не ломаем; UI поверх них приводим к Blueprint.

> Дорого менять расположение после десятков экранов с логикой. Дешево — зафиксировать Blueprint + shells сейчас.

---

## 7. PWA — технический чеклист

| Элемент | Требование |
|---------|------------|
| `manifest.webmanifest` | name, short_name из Company settings |
| Icons 192 / 512 | логотип компании |
| `display: standalone` | без браузерного chrome |
| Theme color | `--brand` компании |
| Service worker | v1: installability + offline shell; offline sales — не обещать |
| iOS | apple-touch-icon, status bar |
| Install prompt | подсказка продавцу при первом входе |

CORS / HTTPS обязательны для install (Vercel).

---

## 8. Универсальная ERP-платформа (white-label)

Это не «CRM одного клиента» и не только склад Aromat Plus.

Это **розничная ERP**, которую можно продавать другим сетям.

С первого дня **не хардкодить** в логике:

| Настраивается | Где |
|---------------|-----|
| Название компании | `Company` / Settings |
| Логотип | Brand assets |
| Цвета | Theme tokens (CSS variables per company) |
| Категории / единицы | справочники `companyId` |
| Роли и права | RBAC config |
| Пороги уведомлений | Settings |
| Валюта, язык | Company |
| Правила акций / скидок | GiftRules и политики в БД |

**Ядро** (партии, FIFO, магазины, продажи, approve, audit) — одно.  
**Оболочка** — под клиента.

См. Vision §21.

В коде UI: `company.name`, `company.logoUrl`, `theme.brand` — не строка `"Aromat Plus"` в компонентах (кроме seed/demo).

---

## 9. Как выбирать surface в коде (рекомендация)

```
app/
  (owner)/          ← Owner routes; внутри:
    layout → OwnerShell
      OwnerShell = DesktopSidebar | MobileOwnerChrome  (matchMedia / CSS)
  (seller)/         ← Seller routes only
    layout → SellerPosShell + bottom nav
```

- Не дублировать бизнес-страницы трижды: **одна page**, два presentation-компонента (`WarehouseDesktopTable` / `WarehouseMobileCards`) где нужно.  
- Или route groups `(owner)/(desktop)` только если разойдутся URL — **не требуется** при хороших компонентах.

Детекция: CSS (`lg:`) для chrome; JS `matchMedia` только где без JS нельзя (редко).

---

## 10. Связь с Roadmap

| Фаза | Фокус |
|------|--------|
| **UI Phase (текущая)** | Layouts · PWA · все экраны-каркасы по Blueprint |
| Milestone 2 | Логика POS / sales / discounts |
| … | по №12 |
| Harden | SW, perf, multi-company admin |

---

## Итог

1. **PWA** > отдельное mobile app на старте.  
2. **Один проект** · три поверхности UI.  
3. Owner Mobile **проектируется отдельно**, не «сжатый desktop».  
4. Seller — только скорость продажи.  
5. Сейчас — **идеальный UI**, потом логика.  
6. Архитектура сразу **продаваемая платформа**, не одноразовая кастомка.
