# MANAGER — CURRENT vs TARGET

**Source of truth:** [`MANAGER-MASTER-SPEC.md`](./MANAGER-MASTER-SPEC.md)

## Project status (locked)

```text
R1  — audited + statically verified
M2  — COMPLETE (sellers.create / sellers.assign / unassign / candidates / Manager UI)
M2 static — PASS
Runtime HTTP — PENDING (see MANAGER-PERMISSIONS-M2-VERIFY.md blocker) — not PASS
stores.create — DEFERRED (not part of M2)
M3 / M4 / R5 — NOT STARTED
```

| Функция | Сейчас | Дальше |
|---------|--------|--------|
| Permissions + scope | ✅ R1 | — |
| sales.* default OFF | ✅ | OWNER grant |
| Exact stock MANAGER | bands only | — |
| WH stock MANAGER | 403 | — |
| SELLER create/assign | ✅ M2 COMPLETE | — |
| `stores.create` wire | key OFF · **DEFERRED** | separate slice |
| Transfer SENT/RECEIVED | COMPLETED | **M3** (not started) |
| Manager dashboard | M1 shell | **M4** |
| Finance/COGS | 403 + scrub | keep |

Verify: [R1](./MANAGER-PERMISSIONS-R1-VERIFY.md) · [M2](./MANAGER-PERMISSIONS-M2-VERIFY.md) · [M2 SPEC](./MANAGER-PERMISSIONS-M2-SPEC.md)
