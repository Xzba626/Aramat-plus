---
name: tajstay-overview
description: >-
  TajStay project orientation map. Use when locating code layers, choosing stack
  conventions, onboarding to the repo, or before any feature/API/UI work so the
  agent follows Next.js App Router + Prisma + REST (not LobeHub/Drizzle/tRPC).
  Triggers on 'project overview', 'architecture', 'stack', 'TajStay', 'как устроен проект'.
---

# TajStay Overview

Project: **TajStay** — booking / PMS marketplace (Tajikistan).

## Stack

- Next.js 14 App Router
- TypeScript
- Prisma
- PostgreSQL
- Next Auth (Auth.js)
- Zod
- REST API routes (`src/app/api/**/route.ts`)

## Architecture

- `src/app` — pages + API Route Handlers
- `src/components` — UI
- `src/lib` — domain, auth, services, i18n, security
- `src/features` / `src/widgets` / `src/entities` — feature slices where present
- `prisma/` — schema + migrations (not Drizzle)

There is **no** separate `src/server` package and **no** tRPC / Zustand monorepo layout.

## Rules

- Use **Prisma**, not Drizzle
- Use **App Router**, not React Router / SPA routes
- Validate API input with **Zod**
- Avoid `any`
- **Security first** — auth on mutating routes, no secrets in git, role checks from session/DB
- Prefer existing patterns in `src/lib/auth/*` and sibling API routes
- Local workflow: `npm run dev` (see root `AGENTS.md`); Node 18–20

## Related active skills

- `deep-review` — code/security review checklists
- `testing` — Vitest guidance (adapt to Prisma / Route Handlers)
- `typescript` — type-safety
- `ux` / `ux-audit` / `product-design` — UI behavior and surface design
- `skills-audit` — keep this catalog clean
