# PWA + UX Certification (Phase X + Y)

**Date:** 2026-08-03  
**Scope:** Installable PWA shell, React Query cache, POS local search + virtualization, notification badge, sync indicator, Web Push-ready API.

---

## Implemented

| Item | Status |
|------|--------|
| X1 Manifest + icons + themeColor + SW + install prompt + offline page | DONE |
| X2 Upload prefers `/uploads/…` + SW Cache-First for static/uploads | DONE |
| X3 RQ persist (`cache:*` keys) + POS prefetch neighbours + sync dot | DONE |
| X4 `/api/notifications/count` + bell badge Owner/Seller | DONE |
| X4 PushSubscription model + `/api/push/subscribe` + SW push handlers | DONE (send stubbed until VAPID) |
| X5 POS virtual list + local search (no refetch per keystroke) | DONE |
| Y1/Y2 Stale catalog UI + «syncing» line instead of full blank reload | DONE (POS) |
| Y3 Neighbour prefetch on seller layout | DONE |
| Y9/Y10 Offline copy + green/yellow/red sync | DONE |
| Y12 SW `CACHE_VERSION` purge on activate | DONE |
| Y15 RQ retry + exponential backoff | DONE |
| Y17 visibility / refetchOnWindowFocus | DONE (RQ defaults) |
| Y18 RQ as source of truth for cached catalog/count | DONE |
| Y4 multi-size image pipeline | PARTIAL (helper + file URLs; true 100/300/800 variants later) |
| Y6 incremental catalog delta API | PARTIAL (timed refetch full catalog; delta endpoint next) |
| Y7/Y8 motion / no white flash global | PARTIAL (shell sticky; full view transitions later) |
| Y19 low-end device field test | PENDING (needs physical Redmi-class device) |
| Y20 full Android install field cert | PENDING (needs HTTPS device) |

---

## How to verify locally

1. `npm run dev` (or production start over HTTPS / LAN).  
2. Open Chrome → Application → Manifest + Service Workers.  
3. Seller login → POS: type search — Network must **not** spam `/api/pos/catalog`.  
4. Bell badge polls `/api/notifications/count`.  
5. Toggle offline in DevTools → sync dot red; cached catalog still shown if previously loaded.  
6. `POST /api/push/subscribe` with fake keys writes `PushSubscription` row.

---

## Relation to product RC

Product business certification: [`docs/FINAL-PRODUCT-CERTIFICATION.md`](FINAL-PRODUCT-CERTIFICATION.md) — **PILOT ONLY**.  
This document certifies the **mobile shell / perf layer**, not gift POS apply or multi-branch ops gaps called out there.
