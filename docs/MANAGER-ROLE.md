# Роль MANAGER — бизнес-модель Aramat Plus

**Source of truth:** [`MANAGER-MASTER-SPEC.md`](./MANAGER-MASTER-SPEC.md)

> Менеджер управляет **движением** товара, не **стоимостью**.  
> Exact stock для MANAGER = **bands only**. `sales.create` = **DEFAULT OFF**.

```text
OWNER   → бизнес + деньги + каталог + склад + права MANAGER
MANAGER → ops в scope + transfers + notifications (+ sales/audit / sellers по grant)
SELLER  → POS своего магазина
```

**Этапы:** R1 ✅ · M2 sellers ✅ · `stores.create` DEFERRED · runtime gate → затем M3 design · M4.  
[R1 VERIFY](./MANAGER-PERMISSIONS-R1-VERIFY.md) · [M2 VERIFY](./MANAGER-PERMISSIONS-M2-VERIFY.md)
