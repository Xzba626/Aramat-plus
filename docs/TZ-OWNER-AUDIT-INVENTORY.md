# Aromat Plus — Inventory vs Owner TZ (Zero Trust)

**Дата:** 2026-08-02  
**Режим:** инвентаризация без кода (§10 ТЗ). Исправления — только после утверждения владельцем.

**Легенда статуса**
- **OK** — цепочка UI→API→DB→роли в целом совпадает с ТЗ (нужна повторная проверка сценарием)
- **PARTIAL** — есть куски, но неполный бизнес-сценарий / UX / терминология
- **GAP** — отсутствует или противоречит ТЗ
- **BUG** — ломает сценарий или показывает неверную логику

---

## Матрица (утвердить перед кодом)

| Раздел | Текущий статус | Проблема | Решение | Pri |
|--------|----------------|----------|---------|-----|
| **0. Терминология** | PARTIAL | «История поступлений» vs «История закупок» vs «Партии»; «История склада» vs «История движений»; receive subtitle всё ещё про поставщика | Единый глоссарий RU/TJ: Поступления / Поступление товара / Отправка в магазины / История операций склада / Флаконы — применить в nav, страницах, истории, уведомлениях | P0 |
| **0. Техн. ключи в UI** | PARTIAL | Риск `nav.*` / `common.*` leak; `salesPos`/`teamActivity` ещё в messages; страница `/warehouse/suppliers` жива | Аудит всех `t()` fallback; убрать мёртвые пункты; suppliers только API/модель | P0 |
| **0. Мобилка** | PARTIAL | Гамбургер есть; нужно доказать паритет логики (не урезанный UI) | Smoke Owner mobile: меню ↔ все P0 разделы | P1 |
| **1.1 Dashboard KPI** | OK* | Выручка / Валовая / Чистая / Расходы есть; *доказано API proof | Browser re-proof Owner | P0 |
| **1.2 Abs Δ vs %** | PARTIAL | Abs Δ в KPI есть; нет явного текста «Сегодня X. Вчера Y. Разница Z» | Усилить copy: сегодня/вчера/Δ сомони первым, % вторично | P0 |
| **1.3 График net 7д** | PARTIAL | Sparkline/bars 7д net есть; нет переключателя «месяц» | Добавить toggle 7д / месяц | P1 |
| **1.4 Packaging Cost отдельно** | PARTIAL | Bottle = opex «Флаконы»; в Dashboard **нет** отдельного числа Packaging Cost vs прочий opex | Хранить/показывать 3 слоя: COGS / Packaging / OPEX (магазин + сеть) | P0 |
| **1.5 Список магазинов по net** | PARTIAL | Сортировка по net есть; нужна явная нумерация «лучшие→худшие» и читаемость при 5+ | Усилить UI списка + сумма сети = Σ магазинов (assert) | P0 |
| **1.6 Продавцы/POS дубль** | OK* | Пункт убран из `owner-nav`; ключ `salesPos` в messages мёртв; `/sales` orphan | Удалить orphan pages или redirect; вычистить messages | P1 |
| **1.7 Активность** | OK* | Убрана из nav (остался Журнал); ключ `teamActivity` мёртв | Либо удалить ключи, либо сделать ленту = журнал (не финансы) | P1 |
| **2.1 Имя Флаконы** | OK* | Nav/page «Флаконы»; проверить все строки на «Тара»/packaging leak | Grep + fix остатки | P0 |
| **2.2 Справочник SKU** | PARTIAL | Объём/материал/cost есть; color/cap ещё в схеме/форме (не обязательные?) | UI: color optional/hidden; cap убрать из формы; поля по ТЗ | P1 |
| **2.3 Поступление флаконов** | PARTIAL | Через receive tab + CTA; нет явной «+ Добавить поступление» внутри карточки как primary flow | Упростить UX: одна кнопка поступления внутри «Флаконы» | P0 |
| **2.4 Отправка в магазины** | OK* | Transfer form на packaging page + API; доказано zt-bottles | Browser walkthrough | P0 |
| **2.5 Остатки по магазинам + POS** | OK* | `storeQtys` в API/UI; POS bottle picker + deduct + opex | Re-proof browser Seller | P0 |
| **2.6 Low stock notify** | PARTIAL | Threshold hardcode 5; notify Owner; await fix | Порог по ответу владельца; опционально Setting | P0 |
| **2.7 POS видимость** | OK* | Cart bottle select | Browser Seller | P0 |
| **3.1 Rename warehouse** | PARTIAL | Часть переименована; batches/purchases/history названия расходятся | Глоссарий (см. 0) | P0 |
| **3.2 Поставщики UI** | BUG/GAP | Убраны из warehouse-nav; **форма поступления всё ещё спрашивает поставщика**; страница `/warehouse/suppliers` существует | Скрыть UI везде; модель БД — по ответу владельца | P0 |
| **3.3 Категория vs способ продажи** | PARTIAL | Есть product-types + accounting PIECE/WEIGHT; seed types смешивают «разливное/штучные» | Разделить: Category (user) vs SaleMethod (fixed); UI create product | P0 |
| **3.4 Фото товара** | PARTIAL | Upload API/path есть (Wave C) | Browser proof create/edit photo | P1 |
| **3.5 Категории в Складе** | PARTIAL | `/warehouse/categories` + brands + product-types; settings/references может дублировать | Убрать дубль из Settings; delete/archive policy | P0 |
| **3.6 Archive vs Delete** | PARTIAL | В основном archive | По ответу владельца | P1 |
| **3.7/8 Отчёты Excel/PDF + retention** | GAP | `/reports` CSV частично; **нет PDF/Excel полного**; **нет политики хранения архивов** | Раздел Отчёты P1 launch? PDF/Excel+retention = luxury/P2 per prior residual — **уточнить: блокер запуска?** | P1/P2 |
| **4.1 Продажи IA** | PARTIAL | Nav = Возвраты + Скидки; резервы не в children | Подписи + reservations в раздел | P1 |
| **4.2 Возврат клиента** | OK* | Seller request → Owner approve → stock/analytics; Owner manual return-in отдельно | UI: чётко «Возврат от клиента» vs «Возврат на склад»; Browser | P0 |
| **4.3 Скидки + подарки** | PARTIAL | `/discounts` история + gift rules CRUD; **POS auto-gift не wired** | Auto-apply gift в POS = residual/P2; очистить посторонние блоки | P1 / gift P2 |
| **4.4 Резервы auto** | GAP | Есть `/reservations`; **нет auto-save корзины + hold stock** | Реализовать auto reserve + release on sale/cancel | P1 |
| **4.5 Центр запросов** | PARTIAL | Dashboard chips «требуют решения»; нет единого inbox UX | Усилить Attention/dashboard как единый центр | P0 |
| **5. Ревизия** | PARTIAL | Blind API+UI Manager; Owner approve; FIFO; UX feedback слабоват | История фильтры; статусы «начата/завершена»; no `common.*` leaks; Manager без финансовой аналитики ревизий | P0 |
| **6. Команда** | OK | Users + Journal | — | — |
| **6.4 RBAC** | PARTIAL | Manager blocked users/wipe/write-offs; approve returns Owner; Manager analytics = full dashboard? | Проверить: Manager не должен видеть сетевую финансовую аналитику (ТЗ); сейчас Manager ходит на `/dashboard`/`/analytics` | P0 |
| **7. Settings** | PARTIAL | Hub есть; references/types; expense types в settings; wipe master Setting | Убрать nested «Настройки»; types→склад; expense types→магазины/финансы; notifications out of settings | P1 |
| **7.5 Wipe 2FA** | PARTIAL | wipeMaster Setting; Owner preserved | Browser proof 2-step | P1 |
| **8. Отчёты** | PARTIAL | `/reports` в finance nav; CSV | PDF+Excel+фильтр магазин+структура 3.7 | P1 |
| **9. Mobile** | PARTIAL | Hamburger | Parity smoke | P1 |

\*OK = backend/scenario proofs существуют; коммерческий PASS только после browser + owner acceptance.

---

## Уже доказанные цепочки (не равны «коммерчески готово»)

| Proof script | Что закрывает |
|--------------|---------------|
| `zt-dashboard-proof.ts` | abs Δ, net after opex+bottle, store sort |
| `zt-bottles-proof.ts` | receive→transfer→storeQtys→sale→OPEX→notify |
| `zt-revision-proof.ts` | count→approve→FIFO + Manager blind API |
| `zt-return-proof.ts` | seller request→approve→stock+dashboard |
| `zt-cross-module-proof.ts` | expense→net; discount→sale |
| `zt-page-smoke.ts` | route access 3 roles |

---

## Предлагаемый порядок исправлений (после утверждения)

1. **P0 Glossary + Suppliers UI hide** (термины + убрать поставщика из receive)  
2. **P0 Dashboard 1.2/1.4/1.5** (текст Δ, packaging cost split, store ranking clarity)  
3. **P0 Category vs SaleMethod**  
4. **P0 Manager RBAC analytics scope** (если подтверждено §6.4)  
5. **P0 Revision UX + history**  
6. **P0 Request center polish + returns naming**  
7. **P1** Settings declutter, reports, reservations auto, mobile parity  
8. **P2** POS auto-gifts, PDF/Excel full, archive retention, Customer CRM  

---

## Вопросы владельцу (блокер матрицы)

Ответьте пунктами 1–5 — после этого обновлю Pri и начну код **по одному разделу**.

1. **Поставщики:** скрыть из UI (модель оставить) **или** удалить из БД?  
2. **Категории:** только архив **или** архив + удалить (если не использовалась)?  
3. **Списание:** оставить / скрыть / убрать?  
4. **Порог флаконов:** 5 / 10 / 3 / настройка в Settings (default 5)?  
5. **Права менеджера:** как §6.4 **или** расширить (сеть / approve запросов)?

Доп. уточнение: **PDF/Excel + политика хранения архивов** — это **блокер запуска (P0/P1)** или **после запуска (P2)**?
