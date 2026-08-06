import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
async function main() {
  const sales = await p.sale.findMany({
    where: { items: { none: {} } },
    select: { id: true },
  });
  const transfers = await p.transfer.findMany({
    where: { items: { none: {} } },
    select: { id: true },
  });
  if (sales.length) {
    await p.sale.deleteMany({ where: { id: { in: sales.map((s) => s.id) } } });
  }
  if (transfers.length) {
    await p.transfer.deleteMany({
      where: { id: { in: transfers.map((t) => t.id) } },
    });
  }
  console.log(
    JSON.stringify({
      deletedSales: sales.length,
      deletedTransfers: transfers.length,
    })
  );
  await p.$disconnect();
}
main().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
