# Architecture & Business Logic Audit — AROMAT PLUS ERP

**Date:** 2026-07-30  
**Scope:** Full ERP integrity (roles → stock → sales → returns → analytics → UI)  
**Mode:** Defect-first audit + targeted fixes (no greenfield rewrite)

---

## Executive verdict

The **core inventory spine works** end-to-end:

`Warehouse receive (Batch + StockBalance) → Transfer FIFO → Store stock → Seller POS → Sale (deduct STORE) / Owner Direct (deduct WAREHOUSE) → Dashboard / Store KPIs / Journal`

Smoke: `npm run smoke:cycle` — **PASS** (warehouse → transfer → POS → sale → DB balances).

Before this audit, several **owner/seller UX shells were disconnected** from that spine (mocks, status-only APIs). Critical gaps below were closed in this pass; remaining items are listed for manual follow-up.

---

## 1. Architectural problems found

| # | Problem | Severity |
|---|---------|----------|
| A1 | Owner Direct POS used `MOCK_OWNER_POS_CATALOG`; checkout never called `POST /api/sales` | P0 |
| A2 | Return APPROVE only flipped `SaleReturn.status` — **no stock restore**, sale stayed `COMPLETED` | P0 |
| A3 | No `POST /api/returns` / discount create — seller UI toast-only | P0 |
| A4 | Analytics products/sellers from `MOCK_ANALYTICS_*` | P1 |
| A5 | Write-offs page local mock — no FIFO deduct | P1 |
| A6 | Store expenses tab local mock — `Expense` model unused | P1 |
| A7 | Company settings form mocked; schema only has `name` + `currency` | P1 |
| A8 | Revision hub page fully mock; DB `InventorySession` unused at network level | P1 |
| A9 | Notifications almost never written (`notification.create` missing on workflows) | P1 |
| A10 | `createSale` interactive transaction default 5s timed out on cold Neon (`test-stock-flow`) | P2 |
| A11 | Discount decision had no requester notify | P2 |

**Intact (verified by services + smoke):** product nomenclature, batches, transfers, seller POS catalog, `createSale` location rules (BRANCH→STORE, OWNER_DIRECT→WAREHOUSE), dashboard decisions from live `SaleReturn` / `DiscountRequest`, activity log on stock ops.

---

## 2. Broken business scenarios (before fix)

1. Owner sells via Owner Direct → warehouse stock / revenue / profit **unchanged**.
2. Seller requests return → owner “approves” → stock **not** returned; sale still completed.
3. Seller requests discount → owner never sees a real pending row from that UI path.
4. Owner opens Analytics → Top products/sellers → **fake rankings**.
5. Owner writes off goods → toast only → warehouse qty unchanged.
6. Owner adds store expense → UI only → analytics expenses empty.
7. Company rename in settings → not persisted.
8. Network revision page → invents fake sessions.

---

## 3. Missing / weak links

```
Sale ──X──> SaleReturn.create (API missing)
SaleReturn.APPROVE ──X──> StockBalance / Batch restore
DiscountRequest.create ──X──> UI
Sale / SaleItem ──X──> Analytics products UI
Expense ──X──> Store expenses UI
ActivityLog WRITE_OFF ──X──> Write-off UI
Notification ──X──> Return / Discount events
Company ──X──> Settings form
InventorySession ──weak──> /revision (mock)
```

---

## 4. Links fixed in this pass

| Chain | Fix |
|-------|-----|
| Owner Direct → warehouse catalog → `POST /api/sales` | `owner-direct-pos-client.tsx` + real stock reload |
| Seller return → `SaleReturn` → owner decide → stock restore + `Sale.status=RETURNED` | `sale-return.service.ts`, `/api/returns`, decision route |
| Seller discount → `DiscountRequest` + owner notify | `discount-request.service.ts`, `/api/discount-requests` |
| Analytics products/sellers/expenses | `analytics.service.ts` + `/api/analytics` + page |
| Warehouse write-off FIFO | `write-off.service.ts` + `/api/warehouse/write-offs` + page |
| Store expenses CRUD path | `expense.service.ts` + `/api/expenses` + store detail tab |
| Company name/currency | `/api/company` GET/PATCH + settings page |
| Revisions list | `/api/revisions` + revision page (read-only list; no fake create) |
| Notifications on return/discount | `notification.service.ts` |
| Sale TX timeout | `createSale` / write-off / return approve → 20s |

---

## 5. Pages previously outside architecture

| Page | Before | After |
|------|--------|-------|
| `/stores/[id]/pos` | Mock POS | Live warehouse + sale |
| `/analytics` (products/sellers) | Mocks | Live month sales |
| `/returns` history | Mock history | Live `/api/returns` |
| `/warehouse/write-offs` | Mock | Live write-off |
| `/settings/company` | Mock | Live company |
| `/revision` | Mock CRUD shell | Live list + honest hint |
| Store tab Expenses | Mock | Live expenses |
| Seller `/pos/cart` discount | Toast | Creates DiscountRequest |
| Seller `/pos/history` return | Toast | Creates SaleReturn |

Still partial: **GiftRule**, full inventory count→FIFO adjust, seller notifications page may still be thin.

---

## 6. Entities linkage status

| Entity | Linked? |
|--------|---------|
| Company / Store / User / Product / Brand / Category | Yes |
| Batch / StockBalance / Transfer | Yes |
| Sale / SaleItem | Yes |
| SaleReturn | Yes (create + approve restore) |
| DiscountRequest | Yes (create + decide + notify) |
| Expense / ExpenseType | Yes (API + store UI + analytics) |
| Notification | Partially (return/discount; not every stock event) |
| ActivityLog | Yes on core ops + write-off/expense |
| InventorySession | List yes; create/approve→stock adjust **not** complete |
| GiftRule | Schema only — unused in POS |
| Setting | Schema — lightly used |

---

## 7. Data sync issues found

- Mock catalogs / analytics / write-offs / expenses / company / revision → **UI lied about ERP state**.
- Approve return without stock restore → **ledger desync**.
- Dashboard decisions required DB rows that UI never created.
- Owner Direct sales never entered `Sale` → dashboard/store KPIs understated.

---

## 8. What was fixed (file map)

**Services:** `sale-return`, `discount-request`, `analytics`, `write-off`, `expense`, `notification`; `sale.service` timeout.

**API:**  
`/api/returns`, `/api/returns/[id]/decision`, `/api/discount-requests`, `/api/discount-requests/[id]/decision`, `/api/analytics`, `/api/company`, `/api/warehouse/write-offs`, `/api/expenses`, `/api/revisions`.

**UI:** owner direct POS, analytics, returns, write-offs, company settings, revision list, store expenses, seller cart/history.

**i18n:** `errors.FORBIDDEN`, `RETURN_ALREADY_PENDING`, `settingsSub.currency`, `revisionPage.listHint` (RU+TJ).

---

## 9. Manual verification still required

1. Login as **owner** → Owner Direct POS → sell 1 unit → confirm warehouse qty ↓, `/analytics` & dashboard ↑.
2. Login as **seller** → sell → request return → owner approve → store stock ↑, sale `RETURNED`.
3. Seller discount request → appears on dashboard decisions → approve/reject → seller notification row.
4. Write-off one SKU from warehouse → stock ↓, journal `WRITE_OFF`.
5. Add expense on store → appears in store tab + analytics expenses total.
6. Company settings rename → reload persists.
7. Revision: list shows DB sessions only; **do not** expect stock auto-adjust from `/revision` yet.
8. Re-run `npm run smoke:cycle` and (optional) `npm run test:stock-flow` after Neon warm-up.
9. Gift rules / partial returns / inventory approval applying FIFO deltas — **not implemented**.
10. Confirm Neon `DIRECT_URL` for migrations in deploy docs.

---

## Role answers (ERP integrity)

| Question | Answer |
|----------|--------|
| Can owner manage the company? | **Yes** for catalog, stock, transfers, sales visibility, returns, write-offs, expenses, company name; revision **approve→stock** still incomplete. |
| Can seller work without broken chains? | **Yes** for sell path; return & discount now create real requests. |
| Can warehouse manager do the job? | **Mostly** (receive/transfer/return-in/write-off); full revision workflow unfinished. |
| Do actions reflect everywhere? | Core spine + newly wired modules **yes**; GiftRule / full inventory adjust **no**. |
| Are balances/sales/profit/reports coherent? | For live Sale/Stock paths **yes**; avoid trusting any remaining `ui-mocks` leftovers. |

---

## Honesty note

This pass closes the **highest-impact desyncs**. Claiming “100% ERP complete” would be false while inventory approval does not adjust stock and GiftRule is unused. The system is now a **coherent spine with connected satellites**, not a set of demo shells around an empty core.
