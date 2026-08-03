import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const emptySales = await prisma.$queryRaw<{ id: string }[]>`
    SELECT s.id FROM "Sale" s
    WHERE NOT EXISTS (SELECT 1 FROM "SaleItem" i WHERE i."saleId" = s.id)`;
  const emptyTr = await prisma.$queryRaw<{ id: string }[]>`
    SELECT t.id FROM "Transfer" t
    WHERE NOT EXISTS (SELECT 1 FROM "TransferItem" i WHERE i."transferId" = t.id)`;
  console.log("empty sales", emptySales.length, emptySales);
  console.log("empty transfers", emptyTr.length, emptyTr);
  for (const r of emptySales) {
    await prisma.sale.delete({ where: { id: r.id } });
  }
  for (const r of emptyTr) {
    await prisma.transfer.delete({ where: { id: r.id } });
  }
  console.log("cleaned");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
