# Aramat Plus — Production Deployment (Ubuntu + PostgreSQL + PM2)

Цель: повторяемый запуск **без wipe** живых данных.

## 0. Backup ПЕРЕД любыми миграциями

На сервере с PostgreSQL:

```bash
sudo -u postgres pg_dump aromat_plus > /root/aromat_plus_backup_$(date +%F).sql
ls -lh /root/aromat_plus_backup_*.sql
```

Файл должен быть несколько MB (не пустой). Храните копию вне сервера.

Restore (только если нужно):

```bash
sudo -u postgres psql aromat_plus < /root/aromat_plus_backup_YYYY-MM-DD.sql
```

---

## 1. Ubuntu — базовая установка

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl build-essential
```

### Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v && npm -v
```

### PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
sudo -u postgres createuser -P aromat   # задайте пароль
sudo -u postgres createdb -O aromat aromat_plus
```

### PM2

```bash
sudo npm i -g pm2
```

---

## 2. Клон проекта

```bash
cd ~
git clone <YOUR_REPO_URL> Aramat-plus
cd Aramat-plus
npm install
```

---

## 3. Environment

```bash
cp .env.example .env
nano .env
```

Обязательные переменные:

| Variable | Example |
|----------|---------|
| `DATABASE_URL` | `postgresql://aromat:PASSWORD@127.0.0.1:5432/aromat_plus?schema=public` |
| `DIRECT_URL` | same as DATABASE_URL if no pooler |
| `AUTH_SECRET` | long random (`openssl rand -base64 32`) |
| `AUTH_URL` | `http://YOUR_IP:3000` or `https://your.domain` |
| `NEXTAUTH_URL` | same as AUTH_URL |
| `NODE_ENV` | `production` |
| `STORAGE_PROVIDER` | `local` (VPS disk) |
| `UPLOAD_DIR` | `/var/www/aramat/uploads` (outside the git tree) |

> Не оставляйте `localhost` в `AUTH_URL` на VPS — cookies/session сломаются.

### Product photos (Contabo)

Файлы **не** в `public/` приложения (standalone/next start их не всегда отдаёт).  
Диск: `$UPLOAD_DIR/products/`. В БД по-прежнему `Product.imageUrl = /uploads/products/...` — отдаёт route handler.

```bash
sudo mkdir -p /var/www/aramat/uploads/products
sudo chown -R "$USER:$USER" /var/www/aramat/uploads
# one-time: copy files already under the project
cp -a ~/Aramat-plus/public/uploads/products/. /var/www/aramat/uploads/products/ 2>/dev/null || true
```

В `.env`:

```env
STORAGE_PROVIDER=local
UPLOAD_DIR=/var/www/aramat/uploads
```

Проверка после restart:

```bash
curl -I http://127.0.0.1:3000/uploads/products/<file>-md.webp
# 200 + content-type: image/webp
```

Загрузка env для PM2 (пример):

```bash
set -a && source .env && set +a
pm2 start ecosystem.config.js --update-env
```

---

## 4. Миграции и Prisma Client

```bash
npx prisma generate
npx prisma migrate deploy
```

Это **добавляет** недостающие enum/таблицы (в т.ч. `PENDING_APPROVAL`, `PushSubscription`, `ADMIN`).  
**Не** запускайте `migrate reset` / `db push --force-reset` на живой базе.

### Seed (безопасно)

```bash
npx prisma db seed
```

Только upsert пользователей и минимальный каркас компании. **Продажи и остатки не удаляются.**

Учётки по умолчанию:

| Role | Email | Password |
|------|-------|----------|
| OWNER | `owner@aromat.plus` | `owner1234` |
| ADMIN | `admin@aromat.plus` | `admin12345` |
| MANAGER | `manager@aromat.plus` | `manager12345` |
| SELLER | `seller@aromat.plus` | `seller12345` |

Смените пароли после первого входа.

---

## 5. Build и PM2

```bash
mkdir -p logs
npm run build
pm2 start ecosystem.config.js --update-env
pm2 save
pm2 startup
# выполните команду, которую напечатает pm2 startup
```

Проверка:

```bash
pm2 status
curl -I http://127.0.0.1:3000
```

Ожидается `307` → `/login` или `200` на login.

После reboot:

```bash
pm2 resurrect
```

---

## 6. Обновление уже работающего сервера

```bash
cd ~/Aramat-plus
# 1) backup DB
sudo -u postgres pg_dump aromat_plus > /root/aromat_plus_backup_$(date +%F).sql

# 2) code
git pull
npm install
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
npm run build
pm2 restart aramat-plus --update-env
```

---

## 7. Известные ловушки переноса

| Симптом | Причина | Лечение |
|---------|---------|---------|
| `invalid input value for enum "InventoryStatus": "PENDING_APPROVAL"` | Enum в коде новее БД | `prisma migrate deploy` (миграция `20260806200000_…`) |
| Prisma Client missing model | Не сделали `generate` после pull | `npx prisma generate` + restart PM2 |
| API `UNAUTHORIZED` после логина | Неверный `AUTH_URL` / cookies | Выставить публичный URL в `.env` |
| Seed уничтожил данные | Старый wipe-seed | Используйте только новый idempotent seed |

---

## 8. Firewall (опционально)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 3000/tcp
sudo ufw enable
```

Для HTTPS предпочтите Nginx + Let’s Encrypt перед портом 3000.
