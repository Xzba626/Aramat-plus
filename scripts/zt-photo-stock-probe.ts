/** Evidence helper: stock + image presence for photo lifecycle */
import { PrismaClient, LocationType } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const products = await p.product.findMany({
    where: { imageUrl: { not: null } },
    select: { id: true, name: true, imageUrl: true },
  });
  for (const x of products) {
    const u = x.imageUrl!;
    const kind = u.startsWith("data:")
      ? "DATA"
      : u.startsWith("/uploads/")
        ? "UPLOAD"
        : "OTHER";
    console.log(JSON.stringify({ id: x.id, name: x.name, kind, len: u.length }));
  }

  const seller = await p.user.findFirst({
    where: { email: "seller@aromat.plus" },
  });
  console.log("sellerStore", seller?.storeId);
  if (seller?.storeId) {
    const bal = await p.stockBalance.findMany({
      where: {
        locationType: LocationType.STORE,
        locationId: seller.storeId,
        quantity: { gt: 0 },
      },
      include: {
        product: { select: { id: true, name: true, imageUrl: true } },
      },
      take: 20,
    });
    console.log("sellerStockCount", bal.length);
    for (const b of bal) {
      const u = b.product.imageUrl ?? "";
      console.log(
        JSON.stringify({
          productId: b.productId,
          qty: String(b.quantity),
          kind: u.startsWith("data:")
            ? "DATA"
            : u.startsWith("/uploads/")
              ? "UPLOAD"
              : u
                ? "OTHER"
                : "NONE",
          prefix: u.slice(0, 60),
        })
      );
    }
  }

  const mgr = await p.user.findFirst({
    where: { email: "manager@aromat.plus" },
  });
  console.log("mgrStore", mgr?.storeId);
  if (mgr?.storeId) {
    const bal = await p.stockBalance.findMany({
      where: {
        locationType: LocationType.STORE,
        locationId: mgr.storeId,
        quantity: { gt: 0 },
      },
      include: {
        product: { select: { id: true, name: true, imageUrl: true } },
      },
      take: 20,
    });
    console.log("mgrStockCount", bal.length);
    for (const b of bal) {
      const u = b.product.imageUrl ?? "";
      console.log(
        JSON.stringify({
          productId: b.productId,
          qty: String(b.quantity),
          kind: u.startsWith("data:")
            ? "DATA"
            : u.startsWith("/uploads/")
              ? "UPLOAD"
              : u
                ? "OTHER"
                : "NONE",
          prefix: u.slice(0, 60),
        })
      );
    }
  }
}

main()
  .catch(console.error)
  .finally(() => p.$disconnect());
