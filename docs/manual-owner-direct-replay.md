# Manual OWNER_DIRECT Replay (Local)

Use after `npm run db:recreate-local && npx prisma migrate deploy && npm run db:seed`.

## Credentials (seed)

| Role | Email | Password |
|------|-------|----------|
| Owner | owner@aromat.plus | owner1234 |
| Seller | seller@aromat.plus | seller1234 |

## Steps

1. `npm run dev` → open http://localhost:3000
2. Login as **owner**
3. **Магазины** → **Личные продажи владельца** → **Открыть продажи** (POS)
4. Create products via **Склад → Поступление** if needed
5. Make 8–10 sales (ml + pcs, with/without discount)
6. **Магазины → Личные продажи → Обзор** — check period filters (Сегодня / Неделя / …)
7. Tabs: **История продаж**, **История скидок**, **История возвратов**, **Расходы**
8. In **История продаж** → **Возврат** on a sale → partial return
9. Add **Расход** in expenses tab
10. Verify funnel: Revenue − COGS = Gross; Gross − Expenses = Net

## Automated cross-check

```powershell
npm run test:forensic-lab
npm run test:forensic-extended
npx tsx scripts/financial-integrity-detector.ts
```

## Expected

- Return restores warehouse stock (OWNER_DIRECT)
- Discount history shows direct owner discounts
- Period filter changes overview KPIs
- No `DATA_INTEGRITY_ANOMALY` banner unless corrupted data injected
