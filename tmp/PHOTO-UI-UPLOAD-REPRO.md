# PHOTO UI UPLOAD — browser reproduction

**Date:** 2026-08-03  
**Mode:** Playwright Chromium → `/warehouse/new` → real `input[type=file]` + React `onChange` (not raw API).

## Evidence

| File | Role |
|------|------|
| `tmp/photo-ui-browser-repro.json` | UI suite (tiny / phone / png) |
| `tmp/photo-upload-debug.json` | Last client-side debug dump from Create Product |
| `scripts/zt-photo-ui-browser-repro.ts` | Re-runnable browser repro |
| `/api/debug/photo-upload-client` | TEMP sink writing debug JSON |

## Result (local Chromium UI)

| Case | Status | Notes |
|------|--------|-------|
| Page `/warehouse/new` | PASS | Authenticated form with file input |
| tiny JPEG (~300 B) | **PASS** | compress skipped; upload 201; preview shown |
| phone JPEG (~2.8 MB) | **PASS** | canvas→JPEG compress 2.8MB→763KB; upload 201 |
| PNG | **PASS** | compress→JPEG; upload 201 |
| UI error text | none | `uiError: null` on all |

Last client debug (`shot.png`):

```json
{
  "fileName": "shot.png",
  "originalSize": 16031,
  "mime": "image/png",
  "compressedSize": 7174,
  "compressedMime": "image/jpeg",
  "toBlobNull": false,
  "uploadStatus": 201,
  "errorStep": null,
  "uiErrorShown": null
}
```

## Status split

| Part | Status |
|------|--------|
| Sharp server pipeline | PASS |
| Storage `/uploads` | PASS |
| URL delivery | PASS |
| **Real UI upload (Chromium Create Product)** | **PASS** (this run) |
| Android camera / HEIC / phone browser | **PENDING** — needs your device log |
| Canvas compression (toBlob null) | **Not reproduced** here (`toBlobNull: false`) |

## If YOU still see an error in the browser

1. Open **Создание товара**.
2. Choose the failing photo once.
3. Open `tmp/photo-upload-debug.json` immediately.

Fields to check:

- `errorStep`: `client_compress` | `upload_api` | `outer_catch`
- `toBlobNull`
- `uploadStatus` + `response.error`
- `uiErrorShown` (exact text shown)

Without that file from the failing device, we cannot claim your phone/browser case is the same as this Chromium PASS.

## Side finding (dev only)

`allowedDevOrigins` must include `127.0.0.1` / `localhost` or Next 16 blocks `/_next` assets and **client JS never hydrates** → file pick does nothing. Added to `next.config.ts`.
