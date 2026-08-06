/**
 * Ensure seed demo users exist without wiping DB.
 * Run: npx tsx scripts/zt-ensure-users.ts
 */
import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";
import {
  SEED_ADMIN_EMAIL,
  SEED_ADMIN_PASSWORD,
  SEED_MANAGER_EMAIL,
  SEED_MANAGER_PASSWORD,
  SEED_OWNER_EMAIL,
  SEED_OWNER_PASSWORD,
  SEED_SELLER_EMAIL,
  SEED_SELLER_PASSWORD,
} from "../src/lib/seed-defaults";

const prisma = new PrismaClient();

async function upsertUser(params: {
  email: string;
  name: string;
  role: Role;
  password: string;
  companyId: string;
  storeId?: string | null;
}) {
  const passwordHash = await bcrypt.hash(params.password, 10);
  const existing = await prisma.user.findUnique({
    where: { email: params.email },
  });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        role: params.role,
        isActive: true,
        name: params.name,
        companyId: params.companyId,
        storeId: params.storeId ?? existing.storeId,
      },
    });
    console.log("updated", params.email);
    return;
  }
  await prisma.user.create({
    data: {
      email: params.email,
      name: params.name,
      role: params.role,
      passwordHash,
      companyId: params.companyId,
      storeId: params.storeId ?? null,
      isActive: true,
    },
  });
  console.log("created", params.email);
}

async function main() {
  const company = await prisma.company.findFirst();
  if (!company) throw new Error("no company — run seed first");
  const store = await prisma.store.findFirst({
    where: { companyId: company.id, isActive: true, kind: "BRANCH" },
  });

  await upsertUser({
    email: SEED_OWNER_EMAIL,
    name: "Владелец",
    role: Role.OWNER,
    password: SEED_OWNER_PASSWORD,
    companyId: company.id,
  });
  await upsertUser({
    email: SEED_ADMIN_EMAIL,
    name: "Администратор",
    role: Role.ADMIN,
    password: SEED_ADMIN_PASSWORD,
    companyId: company.id,
  });
  await upsertUser({
    email: SEED_MANAGER_EMAIL,
    name: "Менеджер",
    role: Role.MANAGER,
    password: SEED_MANAGER_PASSWORD,
    companyId: company.id,
    storeId: store?.id ?? null,
  });
  await upsertUser({
    email: SEED_SELLER_EMAIL,
    name: "Продавец",
    role: Role.SELLER,
    password: SEED_SELLER_PASSWORD,
    companyId: company.id,
    storeId: store?.id ?? null,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
