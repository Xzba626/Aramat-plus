import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
async function main() {
  const sales = await p.sale.findMany({
    where: { items: { none: {} } },
    select: {
      id: true,
      createdAt: true,
      notes: true,
      total: true,
      subtotal: true,
      status: true,
    },
  });
  const transfers = await p.transfer.findMany({
    where: { items: { none: {} } },
    take: 8,
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      createdAt: true,
      notes: true,
      status: true,
      fromWarehouseId: true,
      fromStoreId: true,
      toStoreId: true,
    },
  });
  const transferCount = await p.transfer.count({
    where: { items: { none: {} } },
  });
  console.log(
    JSON.stringify({ saleEmpty: sales, transferCount, transferSample: transfers }, null, 2)
  );
  await p.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
