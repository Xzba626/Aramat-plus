import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const left = await p.product.findMany({
    where: {
      OR: [
        { name: { startsWith: "ZT" } },
        { name: { startsWith: "[ARCHIVED TEST]" } },
        { name: "100 мл" },
      ],
    },
    select: { id: true, name: true, kind: true, isActive: true },
  });
  console.log(JSON.stringify(left, null, 2));
}
main().finally(() => p.$disconnect());
