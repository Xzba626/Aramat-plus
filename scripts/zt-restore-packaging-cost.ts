import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const sku = await prisma.packagingSku.findUnique({
    where: { id: "cmsd5wwdo002oumvgojhdh5e6" },
  });
  console.log("before", sku?.name, sku?.defaultCost?.toString(), sku?.volumeMl?.toString());
  if (!sku) return;
  const vol = Number(sku.volumeMl);
  const defaultCost = vol <= 10 ? 1 : vol <= 30 ? 2 : 3;
  await prisma.packagingSku.update({
    where: { id: sku.id },
    data: { defaultCost },
  });
  const prod = await prisma.product.findFirst({
    where: { packagingSkuId: sku.id },
  });
  if (prod) {
    await prisma.product.update({
      where: { id: prod.id },
      data: { defaultCostPerUnit: defaultCost },
    });
  }
  console.log("restored", { name: sku.name, defaultCost, volumeMl: vol });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
