# Owner Product Certification — 2026-08

Zero-trust product acceptance for Aramat Plus CRM (owner lens).

## Money model

```
Revenue − COGS(perfume) = Gross
Gross − Store opex (incl. bottles) = Net
```

Bottles = operational expense on WEIGHT sale, not perfume COGS.

## Matrix

| Section | Status | Problem | Solution | Pri | Wave |
|---------|--------|---------|----------|-----|------|
| Dashboard KPI | DONE | % only, no expenses UI, no chart | Absolute Δ, expenses, 7-day net | P0 | A |
| Stores on home | DONE | Empty/unclear ranking | All BRANCH + sort by net | P0 | A |
| Packaging nav | DONE | `nav.packaging` leak | «Флаконы» | P0 | A |
| Bottles E2E | DONE | No POS bottle, no expense | POS select + deduct + expense | P0 | B |
| Warehouse IA | DONE | Confusing labels | Rename receive/batches/transfer | P0 | A |
| Suppliers UI | DONE | Visible in nav | Hide UI, keep model | P0 | A |
| Discounts nav | DONE | Opens whole dashboard | `/discounts` page | P0 | A |
| Sales→POS | DONE | Opens analytics | Remove nav item | P0 | A |
| Team activity | DONE | Opens analytics | → journal | P0 | A |
| Returns | DONE | Manual return-in confusion | Clarify + re-proof | P1 | C |
| Revision | DONE | Weak UX | Rewrite flow | P1 | C |
| Product types | DONE | Piece/weight in types | Types + accounting separate | P1 | C |
| Photo | DONE | No upload | Upload | P1 | C |
| Reservations | DONE | Extra sales nav | Declutter | P1 | C |
| Settings dupes | DONE | Nested settings | Declutter | P1 | C |
| Mobile shell | DONE | No hamburger | Toggle sidebar | P1 | C |
| Gifts | DONE | Schema only | Discounts «Подарки» CRUD | P2 | D |
| Reports export | DONE | API only | `/reports` CSV UI | P2 | D |
| Master password | DONE | Login pwd only | 2FA wipe via Setting | P2 | D |

## Wave status

| Wave | Status | Notes |
|------|--------|-------|
| A — IA / dashboard | **done** | Nav, dashboard KPIs, warehouse labels |
| B — Bottles E2E | **done** | POS bottle + expense on WEIGHT sale |
| C — Ops P1 | **done** | Returns, revision, photo, mobile shell |
| D — Luxury P2 | **done** | Gift rules CRUD, reports export, wipe master password |

## Residual risks

| Risk | Severity | Mitigation / next step |
|------|----------|------------------------|
| GiftRule POS auto-apply | Medium | Rules CRUD live; POS `isGift` line auto-add not wired — next sprint |
| Export sales cap | Low | Sales CSV filtered by period; full history export not paginated beyond query |
| Wipe master in Setting JSON | Low | Hash stored in `Setting` key `wipeMaster`; backup/restore must include settings |
| Schema drift (GiftRule.productId) | Low | Run `prisma db push` after deploy; column nullable |
| Manager cannot manage gift rules | Low | By design (`requireOwner`); sellers have no gift UI |
| No Customer CRM | Medium | Out of Wave D scope — vision doc |
| Self-service forgot-password | Low | Owner resets via users page only |

## Wave D deliverables (2026-08)

- **D1** — `GET/POST/PATCH/DELETE /api/gift-rules`, `gift-rule.service.ts`, «Подарки» tab on `/discounts`
- **D2** — `/reports` page, Finance nav link, export API `period=today|week|month` for sales/analytics
- **D3** — `wipeMaster` Setting, company settings UI, wipe flow requires master password when set; Owner user never deleted (comment in `crm-wipe.service.ts`)
- **D4** — This document updated
