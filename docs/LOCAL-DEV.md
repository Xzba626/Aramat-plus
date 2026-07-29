# Local development (no Vercel)

## Stack

- Next.js on **localhost:3000** (`npm run dev`)
- PostgreSQL via **Docker Compose** (recommended) or any local Postgres
- Prisma · Auth.js
- **Vercel is not used** during development. Connect GitHub → Vercel only for production later.

## Prerequisites

1. Node.js 20+
2. Docker Desktop for Windows — install, start, wait until it is running
3. Copy env:

```bash
copy .env.example .env
```

Default Docker DB URL is already in `.env.example`:

```
DATABASE_URL="postgresql://aromat:aromat@localhost:5432/aromat_plus?schema=public"
DIRECT_URL="postgresql://aromat:aromat@localhost:5432/aromat_plus?schema=public"
```

Generate `AUTH_SECRET` (PowerShell):

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

## Daily workflow

```bash
npm run db:up
npx prisma db push
npm run db:seed
npm run smoke:cycle
npm run dev
```

Stop DB:

```bash
npm run db:down
```

## Checks

```bash
npm run diagnose:stock
npm run test:stock-flow
npm run smoke:cycle
```

## Accounts (after seed)

- Owner: `owner@aromat.plus` / `owner1234`
- Seller: `seller@aromat.plus` / `seller1234` → Магазин №1

## Do not

- Enable Vercel auto-deploy while building locally
- Add Redis/Kubernetes for this stage
