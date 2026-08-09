# Роль MANAGER — бизнес-модель Aramat Plus

**Source of truth:** [`MANAGER-MASTER-SPEC.md`](./MANAGER-MASTER-SPEC.md)

> Менеджер управляет **движением** товара, не **стоимостью**.  
> Exact stock для MANAGER = **bands only** (без numeric qty).  
> `sales.create` = **DEFAULT OFF**.

```text
OWNER   → бизнес + деньги + каталог + складские поступления + права MANAGER
MANAGER → операции в scope + transfers + notifications (+ sales/audit только по grant)
SELLER  → POS своего магазина + подтверждение приёмки
```

**Этапы:** R1 permissions/scope/bands ✅ → M2 sellers → M3 transfer lifecycle → M4 dashboard.  
Verify: [`MANAGER-PERMISSIONS-R1-VERIFY.md`](./MANAGER-PERMISSIONS-R1-VERIFY.md)
