# Aramat Plus — Product Vision Completion Phase

**Статус:** канон для следующих блоков  
**Критерий готовности:** полный сценарий в UI, не API/таблица/кнопка по отдельности.

---

## Главный принцип

Функция **не готова**, если есть только:

- таблица Prisma;
- API;
- сервис;
- кнопка.

Готово только когда цепочка закрыта:

**UI → API → бизнес-логика → БД → RBAC → связи с разделами → пользователь видит результат.**

Запрещено:

- переписывать `stock.service` / ломать FIFO;
- создавать отдельные товары на каждый объём (`Dior 5ml`, `Dior 10ml`);
- сдавать функции «только через API»;
- считать P2 (Excel/PDF) важнее ядра парфюмерии.

---

## Порядок блоков (фиксированный)

| Block | Название | Суть | Статус |
|-------|----------|------|--------|
| 1 | Discount E2E | seller → owner → sale + cartHash | ✅ |
| 2 | Persistent Cart | IndexedDB, seller+store scope, 5 сценариев | ✅ |
| **3 / 3.1** | **Owner Control Center** | деньги, магазины, центр решений, Finance workspace | 🔄 harden в коде — ждёт UI-приёмку |
| **4** | **Perfume Bottle & Liquid Inventory** | PackagingSku + Product(PACKAGING) + dual FIFO | 📋 [спека](BLOCK-4-LIQUID-BOTTLE-SPEC.md) · ждёт approve → код |
| **5** | **Notifications / Owner Inbox** | центр решений: approve/reject + deep-link | 📋 после Block 4 |
| 6 | Store-to-store workflow | перемещения магазин↔магазин в UI | pending |
| 7 | Customer CRM | клиенты, история, любимые ароматы | pending |
| 8 | PDF / Excel / Import | отчёты и импорт | pending (после ядра) |

Аудит: [PRODUCT-VISION-AUDIT.md](PRODUCT-VISION-AUDIT.md).

Параллельные обязательные темы (встроить в блоки, не «забыть»):

- System Management: Backup / Demo Reset / Full Reset (Owner)
- Роли: `WAREHOUSE`, `ACCOUNTANT` (расширение RBAC)
- Глобальный поиск

---

## Block 3.1 — Control Center (DoD)

Владелец за ~10 секунд на `/dashboard` видит:

1. Выручка / валовая / расходы / чистая (сегодня + дельты).
2. Чипы: скидки, возвраты, низкий остаток, ревизии → действие.
3. Карточки магазинов: продажи, прибыль, лучший товар, проблемы со ссылками.
4. Лента решений: Open + Approve/Reject (не сырой ActivityLog).
5. Меню «Финансы» реально открывает картину бизнеса (`view=` + периоды), а не «старую аналитику наугад».

**Проверка приёмки (ручная):**

- [ ] Approve скидки с главной → POS видит 100→90
- [ ] Финансы → Сегодня / Расходы / Чистая (`focus=net`)
- [ ] Карточка магазина → клик по проблеме ведёт в действие
- [ ] Лента → Открыть / Одобрить / Отклонить

---

## Block 4 — Perfume Liquid & Bottle (модель)

См. полную спеку: [BLOCK-4-LIQUID-BOTTLE-SPEC.md](BLOCK-4-LIQUID-BOTTLE-SPEC.md).

```
Product (Dior Sauvage, WEIGHT)  →  stock в ml (FIFO)
PackagingSku → Product(PACKAGING, PIECE)  →  stock в шт (FIFO)
Sale decant (одна TX):
  −N ml аромата
  −1 флакон
  COGS = мл×cost + bottle cost
```

---

## Связь с техническим Stage 7

`docs/architecture.md` Stage 7 (Packaging + decant) = реализация **Block 4** Product Vision Layer.  
Не откладывать после Excel/PDF.

---

## Текущая позиция агента

1. Control Center 3.1 — UI-приёмка владельцем (параллельно).  
2. Block 4 — **спека готова**, код только после approve спеки + ответов на open questions.  
3. После Block 4 accept → Block 5 Owner Inbox.  
4. Blocks 6–8 и роли/поиск/backup — по очереди, каждый с полным UI-сценарием.
