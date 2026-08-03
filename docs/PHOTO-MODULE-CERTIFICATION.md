# PHOTO MODULE CERTIFICATION

**Product:** Aramat Plus  
**Date:** 2026-08-03  
**Scope:** Image as a business-critical resource (upload → storage → warehouse → POS → PWA cache path)  
**Constraint for this pass:** evidence-first; **no business-logic changes** to sales / inventory / RBAC.

**Evidence artifacts**

| File | Purpose |
|------|---------|
| `tmp/photo-upload-audit.json` | Upload size/format matrix (prior fix proof) |
| `tmp/photo-lifecycle-audit.json` | Storage / optimization / errors / PWA static+HTTP audit |
| `tmp/photo-role-e2e.json` | Same `imageUrl` visible to Manager stock + Seller POS |
| `scripts/zt-photo-upload-fix.ts` | Re-runnable upload proof |
| `scripts/zt-photo-lifecycle-audit.ts` | Re-runnable lifecycle audit |
| `scripts/zt-photo-role-e2e.ts` | Seeds store stock for photo product + role API check |

---

## Executive verdict

| Area | Status |
|------|--------|
| 1. Upload | **PASS** |
| 2. Storage (new path) | **PASS** |
| 2b. Storage (legacy data URLs) | **FAIL** (1 legacy giant data URL remains in DB) |
| 3. Owner view | **PASS** |
| 4. Manager view | **PASS** |
| 5. Seller POS (API field + same URL) | **PASS** |
| 5b. Seller POS (served pixel size) | **FAIL** (cards request **full** ~1600px, not thumb) |
| 6. Mobile camera upload | **PARTIAL** (2–5 MB JPEG server path PASS; physical Android UI not run) |
| 7. Performance @ 100/500/1000 photos | **PENDING** (staging) |

**Photo module is NOT certified CLOSED for commercial readiness.**  
Upload + URL lifecycle across Owner / Manager / Seller APIs is fixed and proven. Remaining gates: legacy base64 row, POS card variant selection, scale perf, real Android camera UX.

---

## Root cause (upload regression — already fixed)

| | |
|--|--|
| **Was** | Upload could fall back to giant `data:` URL → `productSchema.imageUrl.max(2_000_000)` → `VALIDATION_ERROR` → UI «Проверьте данные» |
| **Now** | Client compress → `/api/products/upload` (max **20 MB** in) → **sharp** → WebP **thumb / md / full** under `/uploads/products/` → DB stores short path (`*-md.webp`, max **2048** chars) |

---

## 1. Upload — PASS

From `tmp/photo-upload-audit.json` (`fail: 0`):

| Case | Status | Notes |
|------|--------|-------|
| ~500 KB | PASS | medium on disk |
| ~2 MB (phone-like) | PASS | medium on disk |
| ~5 MB | PASS | medium on disk |
| PNG | PASS | |
| WEBP | PASS | |
| Non-image | PASS | `INVALID_FILE_TYPE` |
| Product create with upload URL | PASS | |
| Huge data URL reject | PASS | HTTP 400 |

**Limits**

| | Previous | Current |
|--|----------|---------|
| Input | ~5 MB (and data-URL trap) | **20 MB** accepted, always re-encoded |
| DB `imageUrl` | up to 2_000_000 chars (data URL) | **2048** chars; `/uploads/…` or tiny legacy `data:` ≤12 KB |
| UI on photo fail | «Проверьте данные» | `FILE_*` / `IMAGE_*` localized (RU/TJ) for upload path |

---

## 2. Storage — PASS (new) / FAIL (legacy)

| Check | Status | Evidence |
|-------|--------|----------|
| New uploads write file URLs only | **PASS** | Upload API returns `/uploads/products/*-md.webp` |
| Variants on disk (thumb/md/full) | **PASS** | Sample: md=115248, thumb=1530, full=783756 bytes |
| No new base64 write path in product upload | **PASS** | Code + proofs |
| Legacy products with `data:` still readable | **PARTIAL** | Validator allows `data:image/…` ≤12 KB |
| DB free of oversized data URLs | **FAIL** | 1 product (`Parfum plus 1`, id `cmsd9jpoy0007jv048xpbe3s2`) still stores **~16 391** char data URL |

**Recommendation (post-audit fix, not done here):** one-shot migration — re-upload/re-encode legacy data URLs to `/uploads/products/`, then strip base64 from DB.

Brand photos: brand UI has **no** image upload today (`N/A`).

---

## 3. Owner view — PASS

| Check | Status | Evidence |
|-------|--------|----------|
| Product detail returns `imageUrl` | PASS | `GET /api/products/{id}` → `/uploads/products/…-md.webp` |
| File reachable | PASS | `GET` file → HTTP **200** |
| Create/edit UI uses compress + upload | PASS | `warehouse/new`, `warehouse/[id]` + `client-image-compress` |

---

## 4. Manager view — PASS

| Check | Status | Evidence |
|-------|--------|----------|
| Stock API exposes `product.imageUrl` | PASS | `stores-detail.service` maps `imageUrl` |
| Live Manager stock sees Owner photo | PASS | `tmp/photo-role-e2e.json`: `managerImageUrl` = same `/uploads/…-md.webp` |

RBAC does **not** strip `imageUrl`. Field is present after Owner upload.

---

## 5. Seller POS — PASS (URL) / FAIL (size)

### Why Seller historically might not see photos

| Hypothesis | Result |
|------------|--------|
| POS API omits `imageUrl` | **Rejected** — `getPosCatalog` sets `imageUrl: resolveProductImageUrl(b.product)` |
| RBAC hides field | **Rejected** — same URL returned to Seller |
| Prisma omit | **Rejected** — `getStoreStock` includes full `product` |
| Empty store stock | **Confirmed as common false negative** — catalog only lists qty>0; without stock Seller sees 0 cards (not “missing photo”) |
| UI wrong field | **Rejected** — `ProductCard` uses `item.product.imageUrl` |

### Live e2e (after seeding store stock for upload product)

| Check | Status | Evidence |
|-------|--------|----------|
| Seller catalog returns image | PASS | `sellerImageUrl` = `/uploads/products/1785769393100-40gvwy96-md.webp` |
| Same URL as Owner | PASS | `sameAsOwner: true` |
| File HTTP 200 | PASS | |

### Size optimization (critical for mobile POS)

| Surface | Intended | Actual | Status |
|---------|----------|--------|--------|
| Disk variants | thumb ~300 / md ~800 / full ~1600 | Created by sharp | PASS |
| DB primary URL | medium | `*-md.webp` | PASS |
| Cart row | thumb | `ProductThumb size="sm"` → thumb | PASS |
| **POS / warehouse ProductCard** | thumb or card (~200–300) | `ProductThumb size="lg"` → **`full`** (~1600px) | **FAIL** |

Code: `product-card.tsx` uses `size="lg"`; `product-thumb.tsx` maps `lg` → `productImageSrc(..., "full")`.

So a 4000×3000 phone photo is compressed on upload, but **POS cards still download the large WebP**, not the 300px thumb. Architecture for multi-size exists; **UI wiring is wrong for list cards**.

---

## 6. Error handling — PARTIAL

| Scenario | API code | RU/TJ | Status |
|----------|----------|-------|--------|
| Missing file | `FILE_REQUIRED` | Localized | PASS |
| Wrong type | `INVALID_FILE_TYPE` | Localized | PASS (proven) |
| Too large (>20 MB) | `FILE_TOO_LARGE` | Localized | PASS (i18n) |
| Sharp failure | `IMAGE_PROCESS_FAILED` | Localized | PASS (i18n + safeCodes) |
| Bad `imageUrl` on product JSON (Zod) | **`VALIDATION_ERROR`** | «Проверьте данные» | **FAIL** — refine message `IMAGE_URL_INVALID` not surfaced (`handleApiError` collapses all Zod → `VALIDATION_ERROR`) |
| Disk full | — | — | **PENDING** (not simulated) |

Upload path is user-friendly. Product body validation for bad image URL is still generic.

---

## 7. Mobile / camera — PARTIAL

| Check | Status |
|-------|--------|
| Server accepts 2–5 MB JPEG | PASS (upload proof) |
| Client compress before upload | PASS (wired on create/edit) |
| Real Android camera → create → POS | **PENDING** device lab (Redmi / Samsung / …) |

Seller should never need Owner to manually shrink photos for **new** uploads — architecture supports that; confirm on device.

---

## 8. Performance — PENDING (scale) / PASS (current)

| Check | Status | Notes |
|-------|--------|-------|
| POS catalog JSON without giant data URLs | PASS | Current catalog uses short URLs; no 50KB+ data URLs in catalog payload |
| Catalog latency (current empty/small) | PASS | ~1s / tiny JSON in audit env |
| 100 / 500 / 1000 products with photos | **PENDING** | Needs seeded staging dataset |
| Progressive load / lazy | PASS | `loading="lazy"` on `ProductThumb` |
| PWA caches `/uploads/` | PASS | `public/sw.js` cache-first for `/uploads/` |
| Full offline read-only catalog | PARTIAL | Images cacheable after visit; catalog snapshot = Phase X |

**Risk if unfixed:** POS card → full WebP × N cards ≈ unnecessary mobile bandwidth even after good server variants.

---

## PWA alignment

```
Phone → client compress → WebP variants on disk
     → DB stores URL only
     → POS/stock APIs return short URL
     → SW can cache /uploads/*
```

This matches the intended commercial architecture. Missing for “closed”: list UIs must prefer **thumb**; optional future fields `imageThumbUrl` / variants in API; offline catalog snapshot.

---

## Final certification table (requested)

| # | Area | Result |
|---|------|--------|
| 1 | Upload | **PASS** |
| 2 | Storage | **FAIL*** (legacy oversized data URL; new path PASS) |
| 3 | Owner view | **PASS** |
| 4 | Manager view | **PASS** |
| 5 | Seller POS | **PASS** (URL) / **FAIL** (card loads full size) |
| 6 | Mobile camera upload | **PARTIAL** |
| 7 | Performance | **PENDING** @ scale |

\*Storage gate fails closed-cert rule until legacy data URL is migrated.

### Closed only when

- [x] Same Owner image URL on warehouse product API  
- [x] Same URL on Manager store stock  
- [x] Same URL on Seller POS catalog (with stock)  
- [ ] POS/list cards load **thumb** (or ≤ card), not full  
- [ ] No oversized `data:` URLs in DB  
- [ ] Zod image errors → specific `IMAGE_*` codes (not «Проверьте данные»)  
- [ ] Android camera e2e on 2–3 devices  
- [ ] Perf baseline @ ≥500 products with photos  

---

## Recommended fix backlog (do after audit approval — no code in this pass)

1. **ProductCard / POS:** use `size="md"` or `"sm"` for grids; reserve `lg`/`full` for detail lightbox only.  
2. **Migrate** legacy `Parfum plus 1` (and any other) data URLs → `/uploads/products/`.  
3. **Zod:** map refine `IMAGE_URL_INVALID` to that error code (or custom issue → safe code), not blanket `VALIDATION_ERROR`.  
4. **Staging:** seed 500–1000 products with photos; measure catalog JSON size + LCP on Android.  
5. **Phase X/Y:** keep three files; optionally return `variants` in POS payload so clients never guess suffixes.

---

## Sign-off

| Role | Verdict |
|------|---------|
| Upload fix | Accepted (proven) |
| Lifecycle product audit | **Open items remain** — see FAIL/PARTIAL/PENDING above |
| Commercial photo readiness | **Not closed** — Pilot-safe for new uploads; fix card variant + legacy data URL before calling photo “done” |
