# Local development (no Vercel)

## Stack

- Next.js on **localhost:3000** (`npm run dev`)
- PostgreSQL via **Docker Compose** (recommended) or any local Postgres
- Prisma · Auth.js
- **Vercel is not used** during development. Connect GitHub → Vercel only for production later.

## Prerequisites

1. Node.js 20+
2. **PostgreSQL 16+** — Docker **не обязателен**
   - Если PostgreSQL уже установлен как служба `postgresql-x64-16` — используйте его
   - Или Docker Desktop (опционально)
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

### Забыли пароль postgres?

1. **PowerShell от имени администратора** (правый клик → «Запуск от имени администратора»)
2. В папке проекта:

```powershell
cd D:\Aramat-plus
.\scripts\reset-postgres-password.ps1 -NewPassword "aromat"
```

3. Обычный PowerShell — дальше как в «Daily workflow» выше (`db:setup-local`, migrate, seed, dev).

Скрипт временно включает `trust` в `pg_hba.conf`, ставит новый пароль и возвращает настройки обратно.

```powershell
$env:PGPASSWORD = "пароль_который_задавали_при_установке_PostgreSQL"
npm run db:setup-local
npx prisma migrate deploy
npm run db:seed
npm run dev
```

### С Docker (опционально)

```bash
npm run db:up
npx prisma db push
npm run db:seed
npm run smoke:cycle
npm run dev
```

Stop DB (только Docker):

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

Пароли печатает `npm run db:seed` в терминал. Не копируйте их в docs / UI / публичный README.
- Owner: `owner@aromat.plus`
- Seller: `seller@aromat.plus` → Магазин №1

## Do not

- Enable Vercel auto-deploy while building locally
- Add Redis/Kubernetes for this stage
