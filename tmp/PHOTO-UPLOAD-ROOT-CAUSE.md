# Photo upload — root cause audit (evidence only)

**Date:** 2026-08-03  
**Constraint:** No product/business fix applied. Temporary server diag logging only → `tmp/upload-diag-last.json`.

---

## What the UI message means

RU text:

> «Не удалось обработать фотографию. Попробуйте JPG или PNG.»

= API code **`IMAGE_PROCESS_FAILED`** (not size limit, not Zod «Проверьте данные»).

---

## What is NOT broken

| Check | Result |
|-------|--------|
| sharp in Node | OK (`0.35.3`) |
| `public/uploads/products` exists + writable | OK |
| Valid `image/jpeg` ~11 KB → upload | **201** |
| Valid `image/jpeg` ~6 MB → upload | **201** |
| Valid `image/png` → upload | **201** |
| Valid `image/webp` → upload | **201** |
| Buffer empty / FormData File | File arrives with correct size when MIME is normal |

Evidence: `tmp/photo-upload-diag.json`

So the pipeline **sharp → resize → webp → disk** works when the **bytes are a real image** and MIME is `image/jpeg|png|webp`.

---

## Pattern that matches the bug report

| Input | Client path | Typical result |
|-------|-------------|----------------|
| JPEG ≤ 350 KB | **compress skipped** → original JPEG uploaded | works (incl. ~11 KB) |
| JPEG ~1.8 MB | **client compress** → canvas → **WebP** uploaded | fails for user |
| PNG (any size) | **always compress** (PNG never skipped) → **WebP** | fails for user |

Code (`src/lib/client-image-compress.ts`):

```ts
if (file.size <= 350_000 && file.type !== "image/png") {
  return file; // skip
}
// else → createImageBitmap → canvas.toBlob(webp|jpeg)
```

**Format/size are red herrings.** What changes is: **client re-encodes to WebP before upload**.

---

## Exact server failure (reproduced)

Corrupt / unreadable WebP bytes:

| Case | HTTP | error | diag.step | sharp message |
|------|------|-------|-----------|---------------|
| truncated webp | 400 | `IMAGE_PROCESS_FAILED` | `metadata_throw` | `Input buffer has corrupt header: webp: unable to parse image` |
| junk webp header | 400 | `IMAGE_PROCESS_FAILED` | `metadata_throw` | same |

Evidence: `tmp/photo-corrupt-probe.json`

Failure step:

```
FormData file OK
→ Buffer OK
→ sharp(buffer).metadata()  ← THROWS HERE
→ IMAGE_PROCESS_FAILED
```

Filesystem / mkdir / write are **not** reached.

---

## Second confirmed bug (different error code)

| Case | HTTP | error | diag.step |
|------|------|-------|-----------|
| real JPEG bytes + MIME `application/octet-stream` + name `photo.jpg` | 400 | `INVALID_FILE_TYPE` | `mime_rejected` |

Reason: extension fallback only runs when MIME is **empty**:

```ts
if (!mime && /\.(jpe?g|png|webp|gif)$/i.test(file.name)) return true;
```

Browsers/Android often send `application/octet-stream` (not empty) → reject even for valid `.jpg`.

UI for this code: «Поддерживаются JPG, PNG и WEBP» — different string. Still a real phone bug.

Evidence: `tmp/photo-mime-probe.json`, `tmp/upload-diag-last.json`

---

## Root cause (concrete)

### Primary (matches JPEG+PNG both fail, 11 KB OK)

1. Client compress turns large JPEG / any PNG into **WebP**.
2. Server `sharp.metadata()` fails on that payload (corrupt/unsupported WebP from browser canvas on the device/browser in use), **or** equivalent unreadable buffer.
3. Catch → **`IMAGE_PROCESS_FAILED`** → misleading «попробуйте JPG или PNG» (file was already turned into WebP).

Not: “JPEG is invalid”. Not: “file too big”. Not: missing `/uploads` folder (proven writable).

### Secondary (phone MIME)

`application/octet-stream` + `.jpg` rejected at MIME gate → `INVALID_FILE_TYPE`.

---

## Probability update (after evidence)

| Hypothesis | Was | Now |
|------------|-----|-----|
| sharp/filesystem broken for all uploads | 70% | **~5%** — valid images all PASS |
| Client WebP compress → sharp can’t parse | 20% | **~75%** — only path that differs for failing cases; IMAGE_PROCESS_FAILED reproduced on bad WebP |
| MIME `octet-stream` / FormData | 10% | **~20%** — confirmed reject; wrong UI string vs report |

---

## What we need from one real UI reproduce

1. Keep temporary diag in upload route.
2. In browser: create product → pick the failing photo once.
3. Open **`tmp/upload-diag-last.json`**.

Expected fields:

- `step`: `metadata_throw` | `mime_rejected` | `encode_throw` | …
- `mimetype`, `filename`, `size`, `bufferLength`, `magic`
- `metaError.message` if sharp threw

That file is the final proof for the device/browser in use.

---

## Fix directions (DO NOT APPLY until approved)

1. **Client:** prefer JPEG output for compress (or skip WebP on Android); never upload canvas-WebP if magic/size looks wrong; fall back to original JPEG/PNG.
2. **Server MIME:** allow `application/octet-stream` when extension is jpg/png/webp; sniff magic bytes.
3. **Errors:** map sharp “corrupt webp” to a clear code: «Не удалось перекодировать фото — отправьте оригинал JPEG/PNG» (not «попробуйте JPEG» after already converting to WebP).
4. Remove temp diag after fix.

---

## Artifacts

| File | Role |
|------|------|
| `tmp/photo-upload-diag.json` | Happy-path matrix |
| `tmp/photo-mime-probe.json` | octet-stream / heic |
| `tmp/photo-corrupt-probe.json` | IMAGE_PROCESS_FAILED reproduction |
| `tmp/upload-diag-last.json` | Last live upload probe (overwrite on each request) |
| `scripts/zt-photo-upload-diag.ts` | Re-run |
| `scripts/zt-photo-mime-probe.ts` | Re-run |
| `scripts/zt-photo-corrupt-probe.ts` | Re-run |
