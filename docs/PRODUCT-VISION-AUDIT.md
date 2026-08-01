# Aramat Plus — Product Vision Audit

**Режим:** только аудит · код не менялся  
**Дата:** 2026-08-01  
**Критерий:** UI → API → логика → БД → RBAC → связи → результат виден пользователю  

Источник принципа: [PRODUCT-VISION-LAYER.md](PRODUCT-VISION-LAYER.md)

---

## Вердикт

Техническое ядро склада и продаж **в основном живое**.  
Пробел продукта: **CRM парфюмерной сети** (разлив+тара, inbox, клиенты, system reset) ещё не собран как связанные сценарии.

Один золотой E2E-сценарий (товар → партия → магазин → продажа → возврат → прибыль → аналитика) по PIECE **проходим**.  
По WEIGHT **проходим на уровне FIFO**, но **не** как разлив+флакон в POS.

---

## Порядок блоков (зафиксирован после аудита)

```
✅ 1 Discount E2E
✅ 2 Persistent Cart
🔄 3.1 Owner Control Center (UI-приёмка)
➡️ 4 Perfume Bottle & Liquid Inventory   ← расширение ядра склада
➡️ 5 Owner Inbox / Notifications
➡️ 6 Store↔store workflow
➡️ 7 Customer CRM
➡️ 8 Import / Export (Excel/PDF)
```

После Block 4 — обязательный повтор `test:final-gate` / E2E chain.

---

## CORE BUSINESS

| Функция | Статус | Где | Что отсутствует | Приоритет |
|---------|--------|-----|-----------------|-----------|
| Создание товара PIECE/WEIGHT | PARTIAL | `warehouse/new`, `api/products`, `product-nomenclature` | Create всё ещё может создать первую Batch в том же POST | P1 |
| Новая поставка = новая Batch | DONE | `warehouse/receive`, `addBatch`, `batches` | — | — |
| FIFO (`deductBatchesFifo`) ml | DONE | `stock.service` | Не трогать; расширять, не копировать | — |
| Остатки склад + магазин | DONE | `StockBalance`, UI warehouse/stores | — | — |
| Перемещение склад → магазин | DONE | `transfer.service`, `transfers/new` | — | — |
| Store → store | API_ONLY | `createStoreTransfer` | Нет UI выбора fromStore | P1 (Block 6) |
| Списания | DONE | `write-offs` | Только склад (by design) | — |
| POS продажа PIECE | DONE | `(seller)/pos` | — | — |
| POS продажа WEIGHT (мл) | PARTIAL | FIFO ок; cart ±1 | Нет ввода мл / режима «разлив» | **P0 Block 4** |
| Packaging / Bottle | **MISSING** | нет в `schema.prisma` | Вся сущность + склад тары | **P0 Block 4** |
| Decant dual FIFO (мл+тара) | **MISSING** | docs only | Одна TX: −ml + −1 bottle + COGS | **P0 Block 4** |
| Скидка seller→owner→sale | DONE | discount + dashboard + cartHash | MANAGER видит UI, approve OWNER-only | P2 |
| Возвраты / partial | DONE | `sale-return`, POS history | То же про MANAGER approve | P2 |
| Persistent cart | DONE | IndexedDB seller:store | — | — |
| Control Center | DONE* | dashboard + finance view= | *UI-приёмка владельцем; ревизия как строка решения слабее | P0 3.1 |
| Расходы (дневная аллокация) | DONE | `expense.service` | Нет отдельной страницы /expenses | P2 |
| Ревизия | DONE | `revision` | Нет отдельного сценария «тара vs жидкость» | Block 4 |
| Резервы | DONE | reservation | — | — |
| ActivityLog / журнал | PARTIAL | `journal` | Нет deep-link в строках журнала | P1 |
| Аналитика периоды | DONE | today/week/month/year | Слабый split WEIGHT ml vs PIECE pcs | Block 4 |
| Роли WAREHOUSE / ACCOUNTANT | **MISSING** | Role enum | Только OWNER/MANAGER/SELLER | P1 |

\* Control Center harden в коде есть; финальный статус = после вашей UI-приёмки.

---

## PROFESSIONAL CRM

| Функция | Статус | Где | Что отсутствует | Приоритет |
|---------|--------|-----|-----------------|-----------|
| Карточка товара (полная) | PARTIAL | `warehouse/[id]` | Фото, продажи, остатки по магазинам, timeline | P1 |
| История движения по товару | PARTIAL | warehouse/history | Нет ленты на карточке товара | P1 |
| Owner Inbox (уведомления+approve) | PARTIAL | notifications + dashboard | Нет единого inbox; DB notif без href | **P0 Block 5** |
| Клиенты CRM | **MISSING** | — | Customer model/API/UI | Block 7 |
| GiftRule | **MISSING** | schema/seed only | Нет API/UI/POS | Luxury |
| Глобальный поиск | PARTIAL | top-bar → products?q= | Нет sales/stores/users/customers | P1 |
| Backup / Demo / Full reset | **MISSING** | nav dead anchors | Нет UI/API | P1 |
| Company logo | PARTIAL | settings/company | Только name/currency; лого статичное | P2 |
| Login lockout + bcrypt | DONE/PARTIAL | `auth.ts` | IP/UA в логах часто null | P2 |
| Users CRUD + password | PARTIAL | users, reset-password | Нет self forgot-password; unlock UI | P2 |

---

## LUXURY FEATURES

| Функция | Статус | Где | Что отсутствует | Приоритет |
|---------|--------|-----|-----------------|-----------|
| Excel / PDF export | API_ONLY | `api/export` CSV | Нет кнопок UI; нет PDF/XLSX | Block 8 |
| Красивые графики | PARTIAL | sparkline на dashboard payload | Слабо в Finance UI | Block 8 |
| Расширенные отчёты | PARTIAL | analytics tabs | — | Block 8 |

---

## Золотой сценарий (проверка «система живая»)

```
Создать товар → Партия → Перемещение в магазин
  → Продать → Вернуть → Прибыль → Аналитика
```

| Вариант | Статус |
|---------|--------|
| PIECE | ✅ проходим end-to-end |
| WEIGHT без тары | ⚠ FIFO/возврат есть; POS мл слабый |
| WEIGHT + Packaging | ❌ Block 4 |

---

## Рекомендация (без кода до подтверждения)

1. **Принять / дожать 3.1** Control Center в UI.  
2. **Block 4** Perfume Bottle & Liquid — расширение склада (не «фича»), + `test:liquid-bottle-flow`, затем final-gate.  
3. **Block 5** Owner Inbox.  
4. Не брать Excel/PDF/Gift до закрытия 4–5.

**Запреты на Block 4:** не `Dior 5ml` как Product; не rewrite `stock.service`; не ломать PIECE; не backend без POS+аналитики.

---

*Ожидаю подтверждение: что чинить первым — 3.1 UI gaps, или старт спецификации Block 4.*
