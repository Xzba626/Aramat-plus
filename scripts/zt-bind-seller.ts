import { PrismaClient, StoreKind } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  try {
    const stores = await p.store.findMany({
      where: { isActive: true },
      select: { id: true, name: true, kind: true },
    });
    console.log("stores", stores);
    const s = await p.store.findFirst({
      where: { isActive: true, kind: StoreKind.BRANCH },
      orderBy: { name: "asc" },
    });
    if (!s) throw new Error("no BRANCH store");
    const u = await p.user.update({
      where: { email: "seller@aromat.plus" },
      data: { storeId: s.id },
    });
    console.log("seller store", u.storeId, s.name, s.kind);
  } finally {
    await p.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
