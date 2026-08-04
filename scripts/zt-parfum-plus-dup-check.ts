import { prisma } from "../src/lib/prisma";

async function main() {
  const rows = await prisma.product.findMany({
    where: {
      name: { contains: "Parfum plus", mode: "insensitive" },
    },
    select: {
      id: true,
      name: true,
      isActive: true,
      archivedAt: true,
      createdAt: true,
      companyId: true,
      _count: { select: { saleItems: true } },
    },
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
  });

  console.log(JSON.stringify(rows, null, 2));
  console.log("count", rows.length);

  const exact = rows.filter((r) => r.name === "Parfum plus");
  console.log("exact name 'Parfum plus':", exact.length, exact.map((r) => r.id));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
