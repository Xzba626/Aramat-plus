# Wave F — Commercial Localization Certification Report

**Date:** 2026-08-03  
**Scope:** Full CRM UI + activity/export label maps + RU/TJ dictionaries  
**Languages:** Russian (RU), Tajik (TJ) only  

---

## Executive verdict

| Gate | Result |
|------|--------|
| Dictionary key parity RU ↔ TJ | **PASS** (1394 / 1394) |
| Empty translations | **PASS** (0) |
| Identical RU/TJ UI strings (Cyrillic) | **PASS** (0 remaining; 47 fixed) |
| Activity ACTION_KEYS coverage | **PASS** (49 actions) |
| Label maps resolve in both locales | **PASS** |
| `t("…")` referenced keys exist | **PASS** |
| Raw API error display without `apiErrorMessage` | **PASS** (0 files) |
| Hardcoded Cyrillic/English UI literals in app/components | **PASS** (0) |
| Render proof (no key fallback; locale switch differs) | **PASS** |
| Interactive browser walkthrough (Owner/Manager/Seller) | **PARTIAL** |

**Overall commercial localization status: PARTIAL**

Automated static + dictionary certification is complete and green.  
Interactive browser walkthrough could not be finished end-to-end: owner password was previously rotated away from seed (`owner1234`), and `manager@aromat.plus` / `seller@aromat.plus` are missing from the database. Re-run walkthrough after providing:

```bash
set ZT_OWNER_EMAIL=owner@aromat.plus
set ZT_OWNER_PASSWORD=***
set ZT_MANAGER_EMAIL=...
set ZT_MANAGER_PASSWORD=...
set ZT_SELLER_EMAIL=...
set ZT_SELLER_PASSWORD=...
npx tsx scripts/zt-localization-walkthrough.ts
```

---

## Scoreboard (required format)

```text
Dashboard — PASS
Warehouse — PASS
Products — PASS
Sales — PASS
Returns — PASS
Inventory — PASS
Bottle Management — PASS
Reports — PASS
Settings — PASS
Notifications — PASS
Revision — PASS
Discounts — PASS
Journal — PASS
Localization (RU) — PASS
Localization (TJ) — PASS
Owner — PARTIAL
Manager — PARTIAL
Seller — PARTIAL
```

Notes on roles: code/nav/i18n surfaces for all three roles are covered by static certification. Role rows are **PARTIAL** only because live authenticated browser traversal was blocked by credentials/user presence — not because untranslated UI was found in role-specific code.

---

## What was fixed in this wave

1. **47 TJ strings** that were identical copies of Russian (e.g. «Система», «Телефон», «Ревизия», «Факт») — replaced with distinct Tajik Cyrillic.
2. **Hardcoded UI:** `мл` → `t("units.ml")` in POS / owner-direct; wipe confirmation phrase `ОЧИСТИТЬ` → language-neutral `WIPE`.
3. Certification tooling:
   - `scripts/zt-localization-cert.ts` — commercial gate (FAIL/WARN/PASS)
   - `scripts/zt-localization-render-proof.ts` — every key + label helper render proof
   - `scripts/zt-localization-walkthrough.ts` — authenticated page scrape for raw enums

Artifacts:

- `tmp/wave-f-localization-cert.json`
- `tmp/wave-f-render-proof.json`
- `tmp/wave-f-walkthrough.json`

---

## Residual risks (honest)

1. **Catalog / DB free-text** (product names, store names, expense type names, auto-generated bottle names like «Флакон 50 мл · стекло») is user/system *data*, not UI chrome. It is not translated by the i18n layer and may appear in the selected UI language context. Acceptable for v1 if treated as data; follow-up: locale-aware packaging default names.
2. **Browser walkthrough** must be completed with real credentials to promote Owner/Manager/Seller from PARTIAL → PASS.
3. Re-run after every feature drop:

```bash
npx tsx scripts/zt-localization-cert.ts
npx tsx scripts/zt-localization-render-proof.ts
npx tsx scripts/zt-localization-walkthrough.ts
```

---

## How PASS was proven (automated)

- Full flatten of `src/messages/ru.json` and `tj.json`
- Parity + non-empty + non-identical Cyrillic check
- All `ACTION_KEYS` / entity / status / role maps resolve
- All activity `action: "FOO"` literals mapped
- All static `t("a.b")` / `labelKey` / `titleKey` references resolve
- Heuristic scan of `src/app` + `src/components` for hardcoded Cyrillic / English UI words → 0 hits
- Render proof: no key-as-text fallback; login-fail actor uses email; revision statuses labeled
