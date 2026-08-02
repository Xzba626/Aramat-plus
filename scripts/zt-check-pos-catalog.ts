import { PrismaClient, StoreKind } from "@prisma/client";
import { getPosCatalog } from "../src/lib/services/pos-catalog.service";

const p = new PrismaClient();

async function main() {
  const company = await p.company.findFirst();
  const store = await p.store.findFirst({
    where: { kind: StoreKind.BRANCH, isActive: true },
  });
  if (!company || !store) throw new Error("no company/store");
  const cat = await getPosCatalog({
    companyId: company.id,
    storeId: store.id,
  });
  const bottles = cat.items.filter(
    (i) =>
      /флакон|bottle|packaging/i.test(i.product.name) ||
      i.salePrice === 0
  );
  console.log(
    JSON.stringify(
      {
        store: store.name,
        items: cat.items.length,
        suspect: bottles.map((b) => ({
          name: b.product.name,
          price: b.salePrice,
          qty: b.quantity,
        })),
        sample: cat.items.slice(0, 5).map((i) => i.product.name),
      },
      null,
      2
    )
  );
}

main().finally(() => p.$disconnect());
