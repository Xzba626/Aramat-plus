# Deploy without Vercel (VPS · Docker · PostgreSQL)

Goal: take this repo from GitHub and run production **without** changing business code.

## Requirements

- Node 20+ (if not using Docker for the app)
- PostgreSQL 16+
- Public HTTPS URL (for Auth.js cookies)

## Environment (production)

Copy `.env.example` → `.env` (or Compose `--env-file`).

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` / `DIRECT_URL` | Postgres. On Neon keep pooler vs direct split. |
| `AUTH_SECRET` | Long random secret |
| `AUTH_URL` / `NEXTAUTH_URL` | **Real domain only** — never `localhost` in production |
| `STORAGE_PROVIDER` | `local` (Docker volume) or `vercel-blob` |
| `BLOB_READ_WRITE_TOKEN` | Only if using Vercel Blob / remote object storage |

File storage is behind `ImageStorageBackend` (`src/lib/storage`). Swap provider without touching product/sale logic.

## Option A — Docker Compose (recommended)

```bash
cp .env.example .env.prod
# Edit AUTH_URL=https://your-domain.example and AUTH_SECRET

docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

App listens on `:3000`. Point reverse proxy (Caddy/Nginx) at it with TLS.

Uploads persist in volume `aramat_uploads`.

## Option B — Node standalone on the host

```bash
npm ci
npx prisma migrate deploy
npm run build
# output: .next/standalone + .next/static + public
node .next/standalone/server.js
```

Set `STORAGE_PROVIDER=local` and ensure `public/uploads` is writable (or use Blob).

## Migrations

```bash
npx prisma migrate deploy
```

Docker image runs this automatically before `node server.js`.

## Checklist after move

1. Login works on the production domain (no redirect to localhost).
2. Product photo upload + delete works.
3. Sales / stock / analytics unchanged.
4. No `localhost` in `AUTH_URL` / `NEXTAUTH_URL`.
