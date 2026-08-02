import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const WIPE_MASTER_SETTING_KEY = "wipeMaster";

type WipeMasterValue = {
  passwordHash: string;
  hint: string | null;
};

export async function getWipeMasterMeta(companyId: string) {
  const row = await prisma.setting.findUnique({
    where: {
      companyId_key: { companyId, key: WIPE_MASTER_SETTING_KEY },
    },
  });
  if (!row) {
    return { configured: false as const, hint: null as string | null };
  }
  const val = row.value as WipeMasterValue;
  return {
    configured: Boolean(val?.passwordHash),
    hint: val?.hint ?? null,
  };
}

async function getWipeMasterHash(companyId: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({
    where: {
      companyId_key: { companyId, key: WIPE_MASTER_SETTING_KEY },
    },
  });
  if (!row) return null;
  const val = row.value as WipeMasterValue;
  return val?.passwordHash ?? null;
}

export async function setWipeMasterPassword(params: {
  companyId: string;
  password: string;
  hint?: string | null;
  currentOwnerPassword?: string;
  ownerId: string;
}) {
  if (params.password.length < 6) throw new Error("VALIDATION_ERROR");

  const owner = await prisma.user.findFirst({
    where: {
      id: params.ownerId,
      companyId: params.companyId,
      role: "OWNER",
      isActive: true,
    },
  });
  if (!owner) throw new Error("FORBIDDEN");

  const existingHash = await getWipeMasterHash(params.companyId);
  if (existingHash) {
    if (!params.currentOwnerPassword) throw new Error("WRONG_PASSWORD");
    const ok = await bcrypt.compare(
      params.currentOwnerPassword,
      owner.passwordHash
    );
    if (!ok) throw new Error("WRONG_PASSWORD");
  }

  const passwordHash = await bcrypt.hash(params.password, 10);
  const value: WipeMasterValue = {
    passwordHash,
    hint: params.hint?.trim() || null,
  };

  await prisma.setting.upsert({
    where: {
      companyId_key: {
        companyId: params.companyId,
        key: WIPE_MASTER_SETTING_KEY,
      },
    },
    create: {
      companyId: params.companyId,
      key: WIPE_MASTER_SETTING_KEY,
      value,
    },
    update: { value },
  });

  return { ok: true as const };
}

export async function clearWipeMasterPassword(params: {
  companyId: string;
  ownerId: string;
  ownerPassword: string;
}) {
  const owner = await prisma.user.findFirst({
    where: {
      id: params.ownerId,
      companyId: params.companyId,
      role: "OWNER",
      isActive: true,
    },
  });
  if (!owner) throw new Error("FORBIDDEN");

  const ok = await bcrypt.compare(params.ownerPassword, owner.passwordHash);
  if (!ok) throw new Error("WRONG_PASSWORD");

  await prisma.setting.deleteMany({
    where: { companyId: params.companyId, key: WIPE_MASTER_SETTING_KEY },
  });

  return { ok: true as const };
}

/** Verify master password when configured; no-op when not set. */
export async function verifyWipeMasterPassword(
  companyId: string,
  masterPassword?: string
) {
  const hash = await getWipeMasterHash(companyId);
  if (!hash) return;
  if (!masterPassword?.trim()) throw new Error("MASTER_PASSWORD_REQUIRED");
  const ok = await bcrypt.compare(masterPassword, hash);
  if (!ok) throw new Error("WRONG_MASTER_PASSWORD");
}
