# FOUNDATION — один рабочий цикл

**Статус:** текущий фокус проекта  
**Не делать:** новый UI возвратов / аналитики / ревизии / уведомлений  
**Делать:** Warehouse → Store → POS Sale → видно Owner

Связанные: [MASTER](MASTER.md) · [AUDIT](AUDIT-2026-07-28.md) · [TASK-05](tasks/TASK-05-data-flow.md)

---

## Точка контроля

| Вопрос | Как проверить |
|--------|----------------|
| Данные в БД? | `npm run diagnose:stock` |
| Цепочка сервисов? | `npm run test:stock-flow` |
| Полный сценарий? | `npm run smoke:cycle` |
| Seller не видит склад? | `npm run test:seller-isolation` |
| Frontend видит БД? | localhost + те же учётки ниже |

Путь данных (обязательный):

```
UI → API (Next.js) → Prisma → PostgreSQL (local или Neon)
```

Нельзя: mock / local-only state как источник остатков.

---

## Рабочее меню Owner (foundation)

Только:

```
Главная
Центральный склад
Магазины
Пользователи
Настройки
```

Возвраты / Ревизия / Аналитика / Журнал / Уведомления — **скрыты**, пока цикл не стабилен.

Внутри склада: Товары · Категории · Бренды · Партии · Остатки · Приход · Отправка · …

---

## Ручной smoke (10 минут)

1. **Owner** `owner@aromat.plus` — пароль задаётся при seed (см. вывод терминала), не храните в docs.  
2. Склад → Поступление (или уже есть товар)  
3. Склад → Отправка → Магазин №1 → N шт → Подтвердить  
4. Магазины → Магазин №1 → Остатки → товар виден  
5. **Seller** `seller@aromat.plus` — пароль из seed (только локально) → `/pos` → товар с остатком N  
6. Корзина → Продать 1  
7. Seller: остаток N−1  
8. Owner: Магазин → История продаж / diagnose:stock  

Если шаг 5 пустой — смотреть `storeId` продавца и `diagnose:stock` (не «баг UI»).

---

## Neon

Сейчас в `.env` может быть `localhost`. Рекомендуемый локальный путь — **Docker Postgres** (см. [LOCAL-DEV](LOCAL-DEV.md)):

```bash
npm run db:up
```

`DATABASE_URL`:

```
postgresql://aromat:aromat@localhost:5432/aromat_plus?schema=public
```

Опционально Neon (общая удалённая БД):

1. Создать проект Neon → connection string  
2. В `.env` подставить URL  
3. `npx prisma db push && npm run db:seed && npm run smoke:cycle`

Vercel пока **не** подключать.

---

## Критерий «фундамент готов»

- [ ] `test:stock-flow` PASS  
- [ ] `smoke:cycle` PASS  
- [ ] `test:seller-isolation` PASS  
- [ ] Seller видит остаток после transfer (только store, не warehouse)  
- [ ] Sale уменьшает store stock в Neon/local  
- [ ] Нет опоры на mock для остатков  
