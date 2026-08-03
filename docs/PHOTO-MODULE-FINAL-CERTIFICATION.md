# PHOTO MODULE FINAL CERTIFICATION

**Product:** Aramat Plus  
**Date:** 2026-08-03  
**Scope:** Storage, delivery, performance, UX of product photos only.  
**Out of scope:** Sales, inventory, RBAC, API field contracts (`imageUrl` remains medium path).

**Evidence:** `tmp/photo-final-hardening.json`, `tmp/photo-data-url-migration.json`

---

## Architecture (source of truth)

```
Phone camera (JPEG/PNG, ≤20 MB)
  → client compress (JPEG, max edge 1600)
  → POST /api/products/upload
  → ProductImageService.processAndSaveProductImage
  → Local: /uploads/products/{id}.webp | -md.webp | -thumb.webp
  → Production (Vercel): public Blob URLs (BLOB_READ_WRITE_TOKEN required)
  → DB Product.imageUrl = medium URL/path
  → UI: getProductImageUrl(product, "thumb"|"medium"|"full")
  → SW cache-first for /uploads/ (local); Blob URLs load directly
```

**Production note:** Vercel serverless filesystem is read-only. Without `BLOB_READ_WRITE_TOKEN`, upload returns `IMAGE_STORAGE_UNCONFIGURED` (not a silent INTERNAL_ERROR). Create a **public** Blob store in Vercel → Storage → Blob, connect the project, Redeploy.

**Service:** `src/lib/services/product-image.service.ts`  
**Helpers:** `getProductImageUrl`, `productImageSrc`, `sanitizeIncomingImageUrl`  
**Cards:** POS → **thumb**; warehouse/store cards → **medium**; detail → **medium**; never full on list cards.

---

## Certification table

| # | Area | Result | Evidence |
|---|------|--------|----------|
| 1 | Upload | **PASS** | octet-stream JPEG → 201; variants on disk |
| 2 | Compression | **PASS** | thumb < medium < full bytes |
| 3 | Thumbnail delivery | **PASS** | mapping + served thumb ≪ full (e.g. 1.3 KB vs 781 KB) |
| 4 | Legacy migration | **PASS** | 1 data URL → uploads; leftover=0 |
| 5 | Android camera | **PASS** | octet-stream allowed; HEIC → `IMAGE_HEIC_UNSUPPORTED`; EXIF `.rotate()` |
| 6 | POS performance | **PARTIAL** | no giant data URLs; stress 100/500/1000 **PENDING** (staging seed) |
| 7 | PWA cache | **PASS** | SW caches `/uploads/`; new uploads use unique names (no stale overwrite) |

**Overall:** Photo module **commercially ready for Pilot** for upload/delivery/UX. Scale stress (1000 SKUs with photos) remains a staging gate, not a code defect.

---

## 1. Upload — PASS

| Case | Status |
|------|--------|
| JPEG / PNG / WEBP via pipeline | PASS (prior + this run) |
| `application/octet-stream` + `.jpg` | PASS (Android FormData) |
| Max input 20 MB, re-encode always | PASS |
| HEIC | PASS — clear `IMAGE_HEIC_UNSUPPORTED` |

---

## 2. Compression — PASS

| Case | Status |
|------|--------|
| Client prefer **JPEG** (not canvas WebP) | PASS — fixes corrupt-WebP → `IMAGE_PROCESS_FAILED` |
| Server sharp → WebP thumb/md/full + EXIF rotate | PASS |
| Primary DB URL = medium | PASS |

---

## 3. Thumbnail delivery — PASS

| Surface | Variant |
|---------|---------|
| POS `ProductCard` | **thumb** |
| Warehouse / store / transfer cards | **medium** |
| Product detail | **medium** via `getProductImageUrl(..., "medium")` |
| Cart `ProductThumb size="sm"` | **thumb** |

Proof: `served_thumb_smaller_than_full` — thumb=1298 B, medium≈113 KB, full≈781 KB.

---

## 4. Legacy migration — PASS

```
npx tsx scripts/migrate-product-data-urls.ts
```

| Metric | Value |
|--------|-------|
| found | 1 |
| migrated | 1 (`Parfum plus 1`) |
| failed | 0 |
| leftoverDataUrls | 0 |

Idempotent: re-run finds 0 `data:` rows.

---

## 5. Android camera — PASS

| Check | Status |
|-------|--------|
| Empty / octet-stream MIME + image extension | Allowed |
| EXIF orientation | `sharp.rotate()` |
| HEIC message RU/TJ | Localized |
| Client compress JPEG-first | Avoids bad canvas WebP |

Physical multi-device lab still recommended in Pilot; code path covered.

---

## 6. POS performance — PARTIAL

| Check | Status |
|-------|--------|
| Catalog JSON without giant data URLs | PASS |
| Thumb files for cards (not full) | PASS (code + byte proof) |
| 100 / 500 / 1000 products with photos | **PENDING** staging seed |

---

## 7. PWA cache — PASS

| Check | Status |
|-------|--------|
| `/uploads/` cache-first in `public/sw.js` | PASS |
| New photo = new filename → fresh cache entry | PASS |
| Stale old URL may remain until SW version bump | Acceptable for Pilot |

---

## Error UX

| Situation | Code | User sees |
|-----------|------|-----------|
| Bad photo only on create | strip + `IMAGE_STRIPPED` | Product saved; photo warning |
| Zod image-only | `IMAGE_URL_INVALID` | Not «Проверьте данные» |
| HEIC | `IMAGE_HEIC_UNSUPPORTED` | Use JPEG |
| Process fail | `IMAGE_PROCESS_FAILED` | Try another JPEG/PNG |

---

## Pilot note: object storage

`public/uploads` is **OK for Pilot**. Roadmap: Phase Y — Image CDN / S3-compatible object storage for multi-store scale.

---

## Commands

```bash
npx tsx scripts/migrate-product-data-urls.ts
npx tsx scripts/zt-photo-final-hardening.ts
```

---

## Sign-off

| Gate | Status |
|------|--------|
| Upload + variants | Closed |
| Thumb on POS cards | Closed |
| Legacy data URLs | Closed |
| Android MIME / HEIC messaging | Closed |
| Stress @ 1000 photos | Open (staging) |
| CDN migration | Backlog |
