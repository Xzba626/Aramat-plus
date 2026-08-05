/**
 * Evidence-only: put photo-upload product onto seller store stock,
 * then verify manager stock API + seller POS catalog return imageUrl.
 */
import { PrismaClient, LocationType } from "@prisma/client";

const BASE = process.env.ZT_BASE_URL ?? "http://127.0.0.1:3000";
const p = new PrismaClient();

async function login(email: string, password: string) {
  const jar = new Map<string, string>();
  const absorb = (h: Headers) => {
    for (const raw of h.getSetCookie()) {
      const part = raw.split(";")[0];
      const i = part.indexOf("=");
      if (i > 0) jar.set(part.slice(0, i), part.slice(i + 1));
    }
  };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  absorb(csrfRes.headers);
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookie(),
    },
    body: new URLSearchParams({
      csrfToken,
      email,
      password,
      callbackUrl: `${BASE}/`,
      json: "true",
    }),
    redirect: "manual",
  });
  absorb(res.headers);
  return cookie();
}

async function main() {
  const product = await p.product.findFirst({
    where: { imageUrl: { startsWith: "/uploads/" } },
  });
  if (!product) throw new Error("No upload product");

  const seller = await p.user.findFirst({
    where: { email: "seller@aromat.plus" },
  });
  if (!seller?.storeId) throw new Error("No seller store");

  const storeId = seller.storeId;

  await p.batch.create({
    data: {
      productId: product.id,
      locationType: LocationType.STORE,
      locationId: storeId,
      quantity: 5,
      initialQuantity: 5,
      costPerUnit: product.defaultCostPerUnit ?? 10,
      salePrice: product.salePrice ?? 100,
      receivedAt: new Date(),
      notes: "photo-lifecycle-evidence",
    },
  });

  await p.stockBalance.upsert({
    where: {
      productId_locationType_locationId: {
        productId: product.id,
        locationType: LocationType.STORE,
        locationId: storeId,
      },
    },
    create: {
      productId: product.id,
      locationType: LocationType.STORE,
      locationId: storeId,
      quantity: 5,
    },
    update: { quantity: 5 },
  });

  console.log("seeded", { productId: product.id, storeId, imageUrl: product.imageUrl });

  const managerCookie = await login("manager@aromat.plus", "manager1234");
  const sellerCookie = await login("seller@aromat.plus", "seller1234");

  const stockRes = await fetch(`${BASE}/api/stores/${storeId}/stock?pageSize=50`, {
    headers: { Cookie: managerCookie },
  });
  const stock = await stockRes.json();
  const rows = stock?.items ?? stock?.rows ?? [];
  const hit = rows.find(
    (r: { productId?: string; product?: { imageUrl?: string } }) =>
      r.productId === product.id || r.product?.imageUrl
  );
  const mgrImg =
    rows.find((r: { productId: string }) => r.productId === product.id)?.product
      ?.imageUrl ?? null;

  const posRes = await fetch(`${BASE}/api/pos/catalog`, {
    headers: { Cookie: sellerCookie },
  });
  const pos = await posRes.json();
  const posHit = (pos.items ?? []).find(
    (i: { productId: string }) => i.productId === product.id
  );

  const out = {
    managerStockHttp: stockRes.status,
    managerRowCount: rows.length,
    managerImageUrl: mgrImg,
    managerKeys: Object.keys(stock || {}),
    sellerPosHttp: posRes.status,
    sellerItems: pos.items?.length ?? 0,
    sellerImageUrl: posHit?.product?.imageUrl ?? null,
    sameAsOwner: posHit?.product?.imageUrl === product.imageUrl,
    fileHttp: (
      await fetch(`${BASE}${product.imageUrl}`)
    ).status,
  };
  console.log(JSON.stringify(out, null, 2));

  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync("tmp", { recursive: true });
  writeFileSync("tmp/photo-role-e2e.json", JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
