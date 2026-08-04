---
name: Phase 3 Experience Audit
overview: "Phase 3 утверждён с уточнениями. Внедрение волнами A→F. Старт — после вашего явного «начинай / execute»."
todos:
  - id: wave-a-nav
    content: "Wave A: loading.tsx + company cache; prefer RSC/Next cache before any React Query"
    status: pending
  - id: wave-b-theme-lang
    content: "Wave B: theme cookie+LS; locale on User profile (ru/tj) + UI for all roles"
    status: pending
  - id: wave-c-security
    content: "Wave C: security notify on new device/browser/IP change + password events"
    status: pending
  - id: wave-d-storage
    content: "Wave D: Storage abstraction + Vercel Blob adapter only; wire delete"
    status: pending
  - id: wave-e-i18n
    content: "Wave E: i18n audit across all src/**/*.ts(x); fix server notifs + hardcodes"
    status: pending
  - id: wave-f-pwa
    content: "Wave F: PWA readiness — manifest, SW, offline, install-to-phone"
    status: pending
isProject: false
---

# Phase 3 — Approved Plan (refined)

План утверждён. Ниже — уточнённые волны. **Код не меняем, пока не скажете начать.**

## Уточнения (зафиксированы)

1. **Wave A:** перед React Query проверить перевод client pages в Server Components / Next.js caching; RQ только где кэш Next.js не закрывает проблему.
2. **Wave B:** язык → **User profile** (`ru`/`tj`, между устройствами); тема → **cookie + localStorage**, без БД в этой итерации.
3. **Wave C:** не 24ч-антиспам. Уведомлять о входе при **новом устройстве / новом браузере / смене IP** (подозрительный вход).
4. **Wave D:** только Storage abstraction + текущий Vercel Blob adapter; без S3/R2-заглушек заранее. Local FS остаётся как уже существующий fallback при отсутствии blob token.
5. **Wave E:** аудит hardcodes по всему `src/**/*.tsx` и `src/**/*.ts`, не только services.
6. **Wave F (новый):** PWA readiness — manifest, service worker, offline cache, установка на телефон.

Порядок: **A → B → C → D → E → F**.

---

## 1. Аудит (кратко, без изменений)

| Область | Сейчас | Главный пробел |
|---------|--------|----------------|
| Навигация | `Link` везде; seller RQ+prefetch | Нет `loading.tsx`; owner client-fetch on mount |
| Фото | Dual local/Blob в сервисе | Нет pluggable backend; delete не wired |
| Тема | Только light; мёртвый `.theme-dark` | Нет toggle / persistence |
| Язык | Client LS+cookie; toggle в top bars | Нет в User; нет в seller profile |
| i18n | 1458/1458 keys | Server notifs + возможные hardcodes в TSX |
| Security | ActivityLog + owner journal | Нет user-facing notify; IP/UA null |
| PWA | Есть `manifest`, `sw.js` | Нужен аудит install/offline «как приложение» |

---

## 2. Волны внедрения

### Wave A — Скорость навигации

1. `loading.tsx` для `(owner)/` (и при необходимости warehouse) — мгновенный скелетон.
2. Убрать лишний `prisma.company` на каждый nav (кэш/проп в shell).
3. **Сначала** отобрать 2–3 горячие страницы (analytics / products / stores): можно ли RSC + `fetch` cache / server `initialData` по образцу [`dashboard/page.tsx`](src/app/(owner)/dashboard/page.tsx).
4. React Query на owner — **только** если RSC/Next cache недостаточно (повторные визиты в рамках сессии с client interactivity). Не раскатывать RQ на весь owner.

**Файлы:** `(owner)/loading.tsx`, `(owner)/layout.tsx`, выбранные page.tsx / clients, при необходимости `providers.tsx`.

### Wave B — Тема + язык

**Язык (кросс-девайс):**
- Поле на `User` (например `preferredLocale: String?` — `ru` | `tj`).
- При логине / смене языка — писать в User; `I18nProvider` читает профиль → cookie/LS как кэш.
- UI: top bars (как сейчас) + seller profile + owner settings + login (до входа — только cookie, после входа — sync в User).

**Тема (только клиент):**
- `ap_theme` cookie + localStorage; класс на `<html>`; оживить `.theme-dark`.
- Toggle рядом с языком (owner + seller) и в профиле (Светлая / Тёмная).
- Дефолт: light. **Без** поля темы в БД.

**Схема:** минимальная миграция Prisma только под `preferredLocale` (тема — нет).

**Файлы:** `schema.prisma`, i18n provider/switcher, top bars, profile, settings, `globals.css`, messages.

### Wave C — Безопасность

Без новой таблицы `SecurityEvent`.

1. Писать IP + userAgent при login (`requestAuditMeta`).
2. Хранить «отпечаток» последнего успешного входа (например JSON в ActivityLog metadata или лёгкие поля/`lastLoginMeta` на User — выбрать минимальный вариант без тяжёлой схемы).
3. `notifyUser` при:
   - **новом устройстве / браузере** (смена UA fingerprint);
   - **смене IP** относительно последнего успешного входа;
   - смене / сбросе пароля (всегда).
4. Повторный вход с того же device+IP — **без** лишнего notify (не 24ч-таймер, а сравнение fingerprint).
5. Продавец видит в `/pos/notifications`; owner — по-прежнему journal + свои notifs.

**Файлы:** `auth.ts`, password routes, `notification.service.ts`, messages; возможно крошечное поле User или metadata ActivityLog.

### Wave D — Storage

1. Интерфейс `ImageStorageBackend` (`save` / `delete`) в `src/lib/storage/`.
2. Адаптеры: **только** существующие пути — `local` + `vercel-blob` (вынести из `product-image.service.ts`). Без S3/R2.
3. Env: `STORAGE_PROVIDER` / автовыбор по наличию `BLOB_READ_WRITE_TOKEN` как сейчас.
4. Вызвать delete при hard-delete cascade.
5. Обновить `.env.example` (без секретов).

### Wave E — Переводы

1. Расширить/прогнать аудит: hardcodes Cyrillic/English по **`src/**/*.ts` и `src/**/*.tsx`** (не только services).
2. Server notifs → i18n keys (паттерн discount-request).
3. `BRAND_ARCHIVE` в ACTION_KEYS; правка найденных UI hardcodes точечно.

### Wave F — PWA readiness

Аудит + точечные правки до «ощущения приложения»:

1. [`manifest`](src/app/manifest.ts) / icons / `themeColor` / `display`.
2. [`public/sw.js`](public/sw.js) — стратегия кэша, не ломать API/auth.
3. Offline: shell + критичные статичные ассеты; не обещать offline-продажи без явного scope.
4. Проверка install-to-home на mobile (owner + seller).
5. Короткий чеклист + скрин/notes install prompt.

**Файлы:** `manifest.ts`, `layout.tsx` metadata, `sw.js`, при необходимости PWA register helper.

---

## 3. Сознательно НЕ делаем

- Не трогаем продажи, склад, аналитику Phase 2, RBAC.
- Не создаём `SecurityEvent` table.
- Не добавляем S3/R2 adapter «на будущее».
- Не кладём тему в User DB в Phase 3.
- Не «ускоряем всё» через массовый React Query.

---

## 4. Старт

Порядок: **A → B → C → D → E → F**.

После каждой волны — краткий отчёт и проверка owner / manager / seller.

**Чтобы начать реализацию:** напишите явно, например «начинай Wave A» или «execute the plan».
