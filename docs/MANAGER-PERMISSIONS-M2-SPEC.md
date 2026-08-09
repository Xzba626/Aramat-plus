# M2 SPEC — Sellers Management (`sellers.create` / `sellers.assign`)

**Статус:** M2 implementation spec — additive поверх R1  
**Source of truth (архитектура):** [`MANAGER-MASTER-SPEC.md`](./MANAGER-MASTER-SPEC.md)  
**R1 не трогать:** permissions engine, stock bands, finance/WH 403, sales.* defaults, transfer lifecycle.

---

## 0. Discovery (AS-IS) — обязательно до кода

| Вопрос | Факт в коде |
|--------|-------------|
| Где создаётся SELLER? | `POST /api/users` (`src/app/api/users/route.ts`) — сейчас **`requireOwner` only** |
| Где меняется `storeId`? | (1) `PATCH /api/users` — Owner; (2) `POST/DELETE /api/stores/[id]/staff` → `assignStoreStaff` / `unassignStoreStaff` — Owner |
| Prisma-модель | `User.role` + **`User.storeId`** (один магазин). Нет multi-store Seller. `ManagerStoreAccess` — только для MANAGER scope |
| OWNER UI | `/users` (create any assignable role); store detail → вкладка staff (assign/unassign) |
| MANAGER UI `/users` | **middleware block** → redirect `/stores`. M2 UI = store detail staff tab, не новый dashboard |
| Keys уже есть | `sellers.view` / `sellers.create` / `sellers.assign` в `keys.ts`; **не** в `DEFAULT_MANAGER_GRANTS` (OFF) |
| OWNER permissions UI | Уже группа «Продавцы» в `/users/managers/[userId]/permissions` |

**Вывод:** M2 = подключить существующий Seller flow к `requirePermission` + `requireStoreAccess`. Не создавать `/api/sellers` и не менять Prisma.

---

## 1. Scope M2 (in)

- Wire `sellers.create` на `POST /api/users` (MANAGER → только `Role.SELLER`)
- Wire `sellers.assign` на `POST` (+ `DELETE` unbind) `/api/stores/[id]/staff`
- Candidates `GET .../staff?candidates=1` для MANAGER с `sellers.assign` (только SELLER)
- Store-detail UX: create/assign visible только при permission
- `docs/MANAGER-PERMISSIONS-M2-VERIFY.md`

## 2. Out of M2 (explicit)

- **M3** transfer lifecycle · **M4** dashboard · **R5** audit
- `stores.create` wire (упомянут в MASTER §43 как M2 — **отложен**, отдельный slice; не в этом M2)
- Новый RBAC / rewrite `rbac.ts` core / Auth.js / Docker / FIFO / COGS
- Seller multi-store architecture
- Opening full `/users` admin page for MANAGER (остаётся Owner)
- Escalation: MANAGER не создаёт/не повышает до OWNER/MANAGER/ADMIN

---

## 3. Authorization path (unchanged)

```text
session → role → requirePermission(key) → requireStoreAccess(storeId) → existing business logic
```

OWNER/ADMIN bypass permissions (как R1). SELLER — без admin permissions.

---

## 4. `sellers.create`

| | |
|--|--|
| OFF / missing | `403` |
| ON | `POST /api/users` с **принудительно** `role: SELLER` |
| Store | `storeId` **обязателен** для MANAGER; `assertStoreInScope`; не `OWNER_DIRECT` |
| Forbidden roles | OWNER / MANAGER / ADMIN → `403` даже если клиент прислал |

OWNER path `POST /api/users` без регрессии.

## 5. `sellers.assign`

| | |
|--|--|
| OFF | `403` на assign/unassign |
| ON | `POST/DELETE /api/stores/[id]/staff` |
| Target store | в scope MANAGER |
| Target user | только `SELLER`; current `storeId` = `null` **или** in-scope (нельзя «забрать» из чужого store) |
| Нельзя | менять `role`; назначать MANAGER/OWNER; multi-store |

`PATCH /api/users` для MANAGER в M2 **не открываем** (полный user update остаётся Owner) — assign только через staff endpoint.

## 6. `sellers.view`

Ключ остаётся OFF by default. M2 **не** ужесточает `GET .../staff` list (уже `requireOwnerOrManager` + scope). Опциональный gate — вне минимального M2.

## 7. Security checklist

1. create OFF → 403  
2. assign OFF → 403  
3. ON + in scope → 201/200  
4. ON + out-of-scope store → 403  
5. cannot create OWNER/MANAGER/ADMIN  
6. cannot escalate SELLER role  
7. IDOR userId/storeId  
8. OWNER smoke  
9. SELLER POS smoke  
10. LEGACY / ALL / SELECTED  
11. `tsc --noEmit`  
12. R1 static verify still PASS  

---

## 8. DoD

Server gates + scope + OWNER checkboxes already present + Manager store-staff UX + M2-VERIFY + stop (no M3/M4).
