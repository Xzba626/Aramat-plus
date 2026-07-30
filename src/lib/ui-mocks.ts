/** Temporary UI demo data — replace with API in Backend stage. Not for production logic. */

export const MOCK_WRITE_OFFS = [
  {
    id: "wo-1",
    date: "28.07.2026",
    time: "14:20",
    product: "Dior Sauvage",
    batch: "Партия №12",
    qty: "30 мл",
    reason: "Брак",
    actor: "Менеджер Али",
  },
  {
    id: "wo-2",
    date: "27.07.2026",
    time: "11:05",
    product: "Chanel Bleu",
    batch: "Партия №8",
    qty: "15 мл",
    reason: "Повреждение",
    actor: "Владелец",
  },
  {
    id: "wo-3",
    date: "25.07.2026",
    time: "18:40",
    product: "Versace Eros",
    batch: "Партия №3",
    qty: "50 мл",
    reason: "Просрочка",
    actor: "Менеджер Али",
  },
];

export const MOCK_REVISIONS = [
  {
    id: "rev-1",
    date: "28.07.2026",
    store: "Магазин №1 Душанбе",
    createdBy: "Менеджер Али",
    status: "PENDING_APPROVAL",
    statusTone: "warning" as const,
    expected: "500 мл",
    actual: "450 мл",
    diff: "−50 мл",
  },
  {
    id: "rev-2",
    date: "20.07.2026",
    store: "Магазин №2 Худжанд",
    createdBy: "Менеджер Али",
    status: "APPROVED",
    statusTone: "success" as const,
    expected: "320 мл",
    actual: "320 мл",
    diff: "0",
  },
  {
    id: "rev-3",
    date: "12.07.2026",
    store: "Магазин №1 Душанбе",
    createdBy: "Менеджер Али",
    status: "IN_PROGRESS",
    statusTone: "info" as const,
    expected: "—",
    actual: "180 мл",
    diff: "—",
  },
];

export const MOCK_EXPENSES = [
  {
    id: "ex-1",
    date: "01.07.2026",
    type: "RENT",
    amount: 3500,
    description: "Июль 2026",
    actor: "Владелец",
  },
  {
    id: "ex-2",
    date: "05.07.2026",
    type: "SALARY",
    amount: 2800,
    description: "Продавец Саида",
    actor: "Владелец",
  },
  {
    id: "ex-3",
    date: "10.07.2026",
    type: "UTILITIES",
    amount: 420,
    description: "Электричество",
    actor: "Менеджер Али",
  },
];

export const MOCK_ANALYTICS_PRODUCTS = [
  { name: "Dior Sauvage", sold: "120 мл", revenue: 8400, profit: 3100 },
  { name: "Chanel Bleu", sold: "85 мл", revenue: 6800, profit: 2400 },
  { name: "Versace Eros", sold: "60 мл", revenue: 3600, profit: 1100 },
  { name: "YSL Y", sold: "40 мл", revenue: 2800, profit: 900 },
];

export const MOCK_ANALYTICS_SELLERS = [
  { name: "Саида", store: "Магазин №1", checks: 42, revenue: 12450 },
  { name: "Фарход", store: "Магазин №2", checks: 28, revenue: 8200 },
  { name: "Владелец", store: "Личные продажи", checks: 15, revenue: 5100 },
];

export const MOCK_RETURNS_HISTORY = [
  {
    id: "rt-1",
    date: "28.07.2026 13:10",
    store: "Магазин №1",
    seller: "Саида",
    product: "Dior Sauvage 30 мл",
    reason: "Клиент передумал",
    amount: 420,
    status: "PENDING",
  },
  {
    id: "rt-2",
    date: "26.07.2026 16:40",
    store: "Магазин №2",
    seller: "Фарход",
    product: "Chanel Bleu 20 мл",
    reason: "Брак флакона",
    amount: 380,
    status: "APPROVED",
  },
  {
    id: "rt-3",
    date: "22.07.2026 11:05",
    store: "Магазин №1",
    seller: "Саида",
    product: "YSL Y 15 мл",
    reason: "Ошибка продавца",
    amount: 210,
    status: "REJECTED",
  },
];

export const MOCK_OWNER_POS_CATALOG = [
  {
    productId: "p1",
    name: "Dior Sauvage",
    brand: "Dior",
    category: "Мужские",
    unit: "мл",
    quantity: 420,
    salePrice: 14,
  },
  {
    productId: "p2",
    name: "Chanel Bleu",
    brand: "Chanel",
    category: "Мужские",
    unit: "мл",
    quantity: 210,
    salePrice: 16,
  },
  {
    productId: "p3",
    name: "Versace Eros",
    brand: "Versace",
    category: "Мужские",
    unit: "мл",
    quantity: 95,
    salePrice: 12,
  },
  {
    productId: "p4",
    name: "Miss Dior",
    brand: "Dior",
    category: "Женские",
    unit: "мл",
    quantity: 150,
    salePrice: 15,
  },
];

export const MOCK_COMPANY = {
  name: "AROMAT PLUS",
  legalName: "ООО «Аромат Плюс»",
  phone: "+992 90 000 00 00",
  email: "office@aromat.plus",
  address: "Душанбе, Таджикистан",
  currency: "TJS (сомони)",
  timezone: "Asia/Dushanbe",
};
