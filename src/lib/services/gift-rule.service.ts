import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decimalToNumber } from "@/lib/utils";

export type GiftRuleInput = {
  name?: string;
  productId?: string | null;
  minQuantity?: number | null;
  giftProductId: string;
  giftQuantity?: number;
  isActive?: boolean;
};

function mapRule(row: {
  id: string;
  name: string;
  productId: string | null;
  minQuantity: Prisma.Decimal | null;
  giftProductId: string;
  giftQuantity: Prisma.Decimal;
  isActive: boolean;
  createdAt: Date;
  product: { id: string; name: string } | null;
  giftProduct: { id: string; name: string };
}) {
  return {
    id: row.id,
    name: row.name,
    productId: row.productId,
    productName: row.product?.name ?? null,
    minQuantity:
      row.minQuantity != null ? decimalToNumber(row.minQuantity) : null,
    giftProductId: row.giftProductId,
    giftProductName: row.giftProduct.name,
    giftQuantity: decimalToNumber(row.giftQuantity),
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

const ruleInclude = {
  product: { select: { id: true, name: true } },
  giftProduct: { select: { id: true, name: true } },
} as const;

async function assertProduct(companyId: string, productId: string) {
  const p = await prisma.product.findFirst({
    where: { id: productId, companyId },
    select: { id: true, name: true },
  });
  if (!p) throw new Error("PRODUCT_NOT_FOUND");
  return p;
}

async function buildName(
  companyId: string,
  input: GiftRuleInput
): Promise<string> {
  if (input.name?.trim()) return input.name.trim();
  const gift = await assertProduct(companyId, input.giftProductId);
  if (input.productId) {
    const trigger = await assertProduct(companyId, input.productId);
    const qty = input.minQuantity ?? 1;
    return `${trigger.name} × ${qty} → ${gift.name}`;
  }
  const qty = input.minQuantity ?? 1;
  return `Любой товар × ${qty} → ${gift.name}`;
}

export async function listGiftRules(companyId: string) {
  const rows = await prisma.giftRule.findMany({
    where: { companyId },
    include: ruleInclude,
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(mapRule);
}

export async function createGiftRule(companyId: string, input: GiftRuleInput) {
  await assertProduct(companyId, input.giftProductId);
  if (input.productId) await assertProduct(companyId, input.productId);

  const name = await buildName(companyId, input);
  const row = await prisma.giftRule.create({
    data: {
      companyId,
      name,
      productId: input.productId ?? null,
      minQuantity:
        input.minQuantity != null ? input.minQuantity : null,
      giftProductId: input.giftProductId,
      giftQuantity: input.giftQuantity ?? 1,
      isActive: input.isActive ?? true,
    },
    include: ruleInclude,
  });
  return mapRule(row);
}

export async function updateGiftRule(
  companyId: string,
  id: string,
  input: Partial<GiftRuleInput>
) {
  const existing = await prisma.giftRule.findFirst({
    where: { id, companyId },
  });
  if (!existing) throw new Error("NOT_FOUND");

  if (input.giftProductId) await assertProduct(companyId, input.giftProductId);
  if (input.productId) await assertProduct(companyId, input.productId);

  const merged: GiftRuleInput = {
    name: input.name ?? existing.name,
    productId:
      input.productId !== undefined ? input.productId : existing.productId,
    minQuantity:
      input.minQuantity !== undefined
        ? input.minQuantity
        : existing.minQuantity != null
          ? decimalToNumber(existing.minQuantity)
          : null,
    giftProductId: input.giftProductId ?? existing.giftProductId,
    giftQuantity:
      input.giftQuantity ??
      (existing.giftQuantity != null
        ? decimalToNumber(existing.giftQuantity)
        : 1),
    isActive: input.isActive ?? existing.isActive,
  };

  const row = await prisma.giftRule.update({
    where: { id },
    data: {
      name: await buildName(companyId, merged),
      productId: merged.productId ?? null,
      minQuantity:
        merged.minQuantity != null ? merged.minQuantity : null,
      giftProductId: merged.giftProductId,
      ...(input.giftQuantity != null
        ? { giftQuantity: input.giftQuantity }
        : {}),
      ...(input.isActive != null ? { isActive: input.isActive } : {}),
    },
    include: ruleInclude,
  });
  return mapRule(row);
}

export async function deleteGiftRule(companyId: string, id: string) {
  const existing = await prisma.giftRule.findFirst({
    where: { id, companyId },
  });
  if (!existing) throw new Error("NOT_FOUND");
  await prisma.giftRule.delete({ where: { id } });
  return { ok: true as const };
}
