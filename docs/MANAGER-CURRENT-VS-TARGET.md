# MANAGER — CURRENT vs TARGET

**Source of truth:** [`MANAGER-MASTER-SPEC.md`](./MANAGER-MASTER-SPEC.md)  
**R1:** [`MANAGER-PERMISSIONS-R1-VERIFY.md`](./MANAGER-PERMISSIONS-R1-VERIFY.md) · **M2:** [`MANAGER-PERMISSIONS-M2-SPEC.md`](./MANAGER-PERMISSIONS-M2-SPEC.md)

| Функция | Сейчас | Дальше |
|---------|--------|--------|
| Permissions + scope | ✅ R1 | — |
| sales.* default OFF | ✅ | OWNER grant |
| Exact stock MANAGER | bands only | — |
| WH stock MANAGER | 403 | — |
| SELLER create/assign | ✅ M2 gates | — |
| Transfer SENT/RECEIVED | COMPLETED | **M3** |
| Manager dashboard | M1 shell | **M4** |
| stores.create wire | key OFF | later |
| Finance/COGS | 403 + scrub | keep |
