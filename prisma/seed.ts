/**
 * Production-safe seed — NEVER wipes sales / stock / products.
 *
 * Ensures:
 * - Company + central warehouse exist
 * - Reference expense types (incl. Флаконы)
 * - Default role users (bcrypt) upserted
 *
 * Destructive demo wipe lives in: prisma/seed-demo-wipe.ts (explicit opt-in only).
 *
 * Credentials (documented in DEPLOYMENT.md):
 *   owner@aromat.plus   / owner1234
 *   admin@aromat.plus   / admin12345
 *   manager@aromat.plus / manager12345
 *   seller@aromat.plus  / seller12345
 */
import {
  PrismaClient,
  Role,
  StoreKind,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  SEED_OWNER_EMAIL,
  SEED_OWNER_NAME,
  SEED_OWNER_PASSWORD,
} from "../src/lib/seed-defaults";

const prisma = new PrismaClient();

const SEED_USERS: Array<{
  email: string;
  name: string;
  role: Role;
  password: string;
  bindStore: boolean;
}> = [
  {
    email: SEED_OWNER_EMAIL,
    name: SEED_OWNER_NAME,
    role: Role.OWNER,
    password: SEED_OWNER_PASSWORD,
    bindStore: false,
  },
  {
    email: "admin@aromat.plus",
    name: "Администратор",
    role: Role.ADMIN,
    password: "admin12345",
    bindStore: false,
  },
  {
    email: "manager@aromat.plus",
    name: "Менеджер",
    role: Role.MANAGER,
    password: "manager12345",
    bindStore: true,
  },
  {
    email: "seller@aromat.plus",
    name: "Продавец",
    role: Role.SELLER,
    password: "seller12345",
    bindStore: true,
  },
];

async function ensureCompany() {
  let company = await prisma.company.findFirst({
    orderBy: { createdAt: "asc" },
  });
  if (!company) {
    company = await prisma.company.create({
      data: { name: "Aramat Plus", currency: "TJS" },
    });
    console.log("created company", company.id);
  }
  return company;
}

async function ensureWarehouse(companyId: string) {
  let wh = await prisma.warehouse.findFirst({
    where: { companyId, isActive: true },
  });
  if (!wh) {
    wh = await prisma.warehouse.create({
      data: { name: "Центральный склад", companyId },
    });
    console.log("created warehouse", wh.id);
  }
  return wh;
}

async function ensureBranchStore(companyId: string) {
  let store = await prisma.store.findFirst({
    where: { companyId, kind: StoreKind.BRANCH, isActive: true },
    orderBy: { createdAt: "asc" },
  });
  if (!store) {
    store = await prisma.store.create({
      data: {
        name: "Магазин №1",
        companyId,
        kind: StoreKind.BRANCH,
        isActive: true,
      },
    });
    console.log("created store", store.id);
  }
  return store;
}

async function ensureOwnerDirect(companyId: string) {
  const existing = await prisma.store.findFirst({
    where: { companyId, kind: StoreKind.OWNER_DIRECT },
  });
  if (existing) return existing;
  return prisma.store.create({
    data: {
      name: "Личные продажи владельца",
      companyId,
      kind: StoreKind.OWNER_DIRECT,
      isActive: true,
    },
  });
}

async function ensureExpenseTypes(companyId: string) {
  const names = [
    "Аренда",
    "Зарплата",
    "Коммунальные",
    "Интернет",
    "Прочие",
    "Флаконы",
  ];
  for (const name of names) {
    const exists = await prisma.expenseType.findFirst({
      where: { companyId, name },
    });
    if (!exists) {
      await prisma.expenseType.create({ data: { companyId, name } });
      console.log("created expenseType", name);
    }
  }
}

async function upsertUser(params: {
  email: string;
  name: string;
  role: Role;
  password: string;
  companyId: string;
  storeId: string | null;
}) {
  const forcePasswords = process.env.FORCE_SEED_PASSWORDS === "1";
  const existing = await prisma.user.findUnique({
    where: { email: params.email },
  });
  if (existing) {
    const data: {
      name: string;
      role: Role;
      companyId: string;
      storeId: string | null;
      isActive: boolean;
      passwordHash?: string;
    } = {
      name: params.name,
      role: params.role,
      companyId: params.companyId,
      storeId: params.storeId,
      isActive: true,
    };
    // Never reset live passwords unless explicitly forced (ops recovery only).
    if (forcePasswords) {
      data.passwordHash = await bcrypt.hash(params.password, 10);
    }
    await prisma.user.update({
      where: { id: existing.id },
      data,
    });
    console.log(
      "updated user",
      params.email,
      params.role,
      forcePasswords ? "(password reset)" : "(password preserved)"
    );
    return existing.id;
  }
  const passwordHash = await bcrypt.hash(params.password, 10);
  const created = await prisma.user.create({
    data: {
      email: params.email,
      name: params.name,
      role: params.role,
      passwordHash,
      companyId: params.companyId,
      storeId: params.storeId,
      isActive: true,
    },
  });
  console.log("created user", params.email, params.role);
  return created.id;
}

async function main() {
  console.log("Aramat Plus production seed (idempotent, no wipe)…");

  const company = await ensureCompany();
  await ensureWarehouse(company.id);
  await ensureOwnerDirect(company.id);
  const branch = await ensureBranchStore(company.id);
  await ensureExpenseTypes(company.id);

  for (const u of SEED_USERS) {
    const userId = await upsertUser({
      email: u.email,
      name: u.name,
      role: u.role,
      password: u.password,
      companyId: company.id,
      storeId: u.bindStore ? branch.id : null,
    });
    if (u.role === Role.MANAGER && userId) {
      const defaults = [
        "stores.view",
        "stores.stock.bands",
        "transfers.view",
        "transfers.create",
        "inventory.audit.view",
        "inventory.audit.create",
        "notifications.low_stock",
        "notifications.out_of_stock",
        "notifications.transfers",
        "notifications.discrepancy",
        "notifications.audit",
      ];
      const count = await prisma.managerPermission.count({
        where: { userId },
      });
      if (count === 0) {
        await prisma.managerPermission.createMany({
          data: defaults.map((key) => ({ userId, key, enabled: true })),
          skipDuplicates: true,
        });
      }
    }
  }

  console.log("Seed complete. Live sales/stock/products were not deleted.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
