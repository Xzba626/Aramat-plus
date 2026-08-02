import { PrismaClient, ProductKind } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const bottles = await p.product.findMany({
    where: {
      OR: [
        { kind: ProductKind.PACKAGING },
        { name: { contains: "Флакон", mode: "insensitive" } },
        { name: { contains: "флакон", mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, kind: true, salePrice: true, isActive: true },
    take: 30,
  });
  console.log(JSON.stringify(bottles, null, 2));
}

main()
  .finally(() => p.$disconnect());
