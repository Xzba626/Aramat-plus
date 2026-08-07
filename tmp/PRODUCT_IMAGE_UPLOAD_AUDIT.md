# Product image upload — audit (read-only)

**Date:** 2026-08-07  
**Scope:** Contabo VPS photo 404 after “Фото загружено”  
**Rule:** No schema change, no big refactor — diagnose first.

---

## Verdict

Архитектура **уже правильная**. PostgreSQL хранит только URL; файлы — на диске или Vercel Blob.

Скорее всего **Вариант А + env/cwd на Contabo**, а не отсутствие поля в БД и не «надо класть фото в Postgres».

---

## 1. Prisma — поле есть

```
Product.imageUrl   String?
Brand.imageUrl     String?
```

Нет `photoUrl`. Везде используется `imageUrl`.

Postgres **не** хранит бинарники — только строку пути/URL.

---

## 2. API загрузки

| Item | Value |
|------|--------|
| Route | `POST /api/products/upload` |
| Auth | `requireOwner` → OWNER + ADMIN |
| Body | `multipart/form-data` field `file` |
| Pipeline | sharp → WebP variants (full / `-md` / `-thumb`) |
| Response | `{ imageUrl, variants, bytes }` — primary = **medium** URL |

UI (`warehouse/new`, `warehouse/[id]`):

1. client compress → FormData  
2. `POST /api/products/upload` → `setImageUrl(data.imageUrl)` → toast «загружено»  
3. create/update product → `Product.imageUrl =` этот URL  

Preview после upload = URL с сервера (не только blob:). Если toast OK — API вернул 201.

---

## 3. Куда пишется файл

`src/lib/storage/index.ts`:

```
STORAGE_PROVIDER=local | vercel-blob
else if BLOB_READ_WRITE_TOKEN → vercel-blob
else → local
```

**Local** (`local-fs.backend.ts`):

```
disk:  {cwd}/public/uploads/products/<name>.webp
DB:    /uploads/products/<name>-md.webp
```

`mkdir` recursive уже есть.  
`public/uploads/` в `.gitignore` — git pull файлы не привозит (нормально).

**Vercel Blob** — абсолютный `https://….public.blob.vercel-storage.com/…`.

---

## 4. Почему 404 на Contabo (гипотезы по приоритету)

| # | Hypothesis | Evidence to check on VPS |
|---|------------|---------------------------|
| H1 | `BLOB_READ_WRITE_TOKEN` / `STORAGE_PROVIDER=vercel-blob` → URL blob, а токен/сеть ломают отдачу **или** local path записан, а файлов нет | `grep STORAGE BLOB .env`; `curl -I` по URL из БД |
| H2 | Local пишет в `process.cwd()/public/…`, PM2 cwd ≠ `~/Aramat-plus` | `pm2 show aramat-plus` → cwd; `ls public/uploads/products` |
| H3 | Файл записан, но нет прав у user PM2 | `ls -la public/uploads` |
| H4 | Старые товары с Vercel Blob URL / пустой диск после переноса | `SELECT imageUrl FROM "Product" WHERE "imageUrl" IS NOT NULL LIMIT 5;` |
| H5 | Upload «OK» в UI, но URL потом stripped при save | маловероятно для `/uploads/…` — `sanitizeIncomingImageUrl` их пропускает |

Симптом «форма OK → reload 404 на `/uploads/…-md.webp`» = **в БД путь есть, статики на диске нет или Next не отдаёт из того cwd**.

---

## 5. Что НЕ делать

- ❌ Хранить картинки в PostgreSQL  
- ❌ Новые таблицы / миграции ради фото  
- ❌ Переписывать DiscountRequest / большой storage rewrite  
- ❌ Ломать существующие `imageUrl` (старые Blob URL оставить как есть)

---

## 6. Минимальное исправление (предложение — ещё не внедрять без проверки на VPS)

1. Contabo `.env`:
   ```
   STORAGE_PROVIDER=local
   # BLOB_READ_WRITE_TOKEN=   # пусто / закомментировать
   ```
2. На диске:
   ```bash
   mkdir -p ~/Aramat-plus/public/uploads/products
   # владелец = пользователь PM2
   ```
3. PM2 `cwd` = корень проекта (`ecosystem.config.js` уже `__dirname`).
4. Документировать в `DEPLOYMENT.md` + `.env.example` (`STORAGE_PROVIDER=local` для VPS).
5. Smoke:
   ```bash
   # после upload
   ls ~/Aramat-plus/public/uploads/products | tail
   curl -I http://127.0.0.1:3000/uploads/products/<file>-md.webp
   ```

Опционально позже (отдельный маленький commit): health check / лог `storageProvider` + `cwd` при upload; `.gitkeep` в `public/uploads/products`.

---

## 7. Связь со скидками

Скидки OWNER/ADMIN уже в `master` (`c5d9eba`).  
Фото — **отдельный** commit после проверки H1–H3 на Contabo.

---

## Contabo checklist (ручной, 2 минуты)

```bash
cd ~/Aramat-plus
grep -E 'STORAGE|BLOB' .env || true
pm2 show aramat-plus | grep -E 'cwd|script|exec'
ls -la public/uploads/products 2>/dev/null | tail
# взять imageUrl из UI или:
# sudo -u postgres psql aromat_plus -c 'SELECT id, name, "imageUrl" FROM "Product" WHERE "imageUrl" IS NOT NULL ORDER BY "updatedAt" DESC LIMIT 5;'
```
