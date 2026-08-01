/**
 * Commercial cert: seller assign/reassign/unassign reflected immediately
 * via DB (getSessionUser contract) + POS catalog scope.
 *
 * Run: npx tsx scripts/test-seller-store-session.ts
 */
import {
  PrismaClient,
  Role,
  StoreKind,
  LocationType,
  AccountingType,
} from "@prisma/client";
import {
  assignStoreStaff,
  unassignStoreStaff,
} from "../src/lib/services/stores-detail.service";
import { getPosCatalog } from "../src/lib/services/pos-catalog.service";
import { addBatch } from "../src/lib/services/stock.service";
import { createTransfer } from "../src/lib/services/transfer.service";

const prisma = new PrismaClient();

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function main() {
  const company = await prisma.company.findFirst();
  assert(company, "company");

  const branches = await prisma.store.findMany({
    where: { companyId: company.id, kind: StoreKind.BRANCH, isActive: true },
    orderBy: { name: "asc" },
  });
  assert(branches.length >= 1, "need ≥1 active BRANCH");

  const storeA = branches[0];
  let storeB = branches[1];
  if (!storeB) {
    storeB = await prisma.store.create({
      data: {
        name: `Cert Branch B ${Date.now()}`,
        companyId: company.id,
        kind: StoreKind.BRANCH,
        address: "cert",
      },
    });
  }

  const warehouse = await prisma.warehouse.findFirst({
    where: { companyId: company.id, isActive: true },
  });
  assert(warehouse, "warehouse");

  const owner = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.OWNER, isActive: true },
  });
  assert(owner, "owner");

  const seller = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.SELLER, isActive: true },
  });
  assert(seller, "seller");

  // Stock only on store A for a unique product
  const product = await prisma.product.create({
    data: {
      name: `Cert Assign ${Date.now()}`,
      companyId: company.id,
      accountingType: AccountingType.PIECE,
      salePrice: 50,
    },
  });

  await prisma.$transaction(
    async (tx) => {
      await addBatch(tx, {
        productId: product.id,
        locationType: LocationType.WAREHOUSE,
        locationId: warehouse.id,
        quantity: 30,
        costPerUnit: 20,
        notes: "cert-assign",
      });
    },
    { maxWait: 15_000, timeout: 60_000 }
  );

  await createTransfer({
    companyId: company.id,
    fromWarehouseId: warehouse.id,
    toStoreId: storeA.id,
    createdById: owner.id,
    items: [{ productId: product.id, quantity: 10 }],
  });

  // 1) Unassign
  await unassignStoreStaff({
    companyId: company.id,
    storeId: storeA.id,
    userId: seller.id,
    actorId: owner.id,
  });
  const afterUn = await prisma.user.findUnique({
    where: { id: seller.id },
    select: { storeId: true },
  });
  assert(afterUn?.storeId == null, "unassign → storeId null");

  // 2) Assign to A — DB readable immediately (session contract)
  await assignStoreStaff({
    companyId: company.id,
    storeId: storeA.id,
    userId: seller.id,
    actorId: owner.id,
  });
  const afterA = await prisma.user.findUnique({
    where: { id: seller.id },
    select: { storeId: true },
  });
  assert(afterA?.storeId === storeA.id, "assign A persisted");

  const catA = await getPosCatalog({
    companyId: company.id,
    storeId: afterA!.storeId!,
    q: product.name,
  });
  assert(
    catA.items.some((i) => i.productId === product.id),
    "POS catalog A sees product"
  );

  // 3) Reassign to B without "re-login" (DB flip)
  await assignStoreStaff({
    companyId: company.id,
    storeId: storeB.id,
    userId: seller.id,
    actorId: owner.id,
  });
  const afterB = await prisma.user.findUnique({
    where: { id: seller.id },
    select: { storeId: true },
  });
  assert(afterB?.storeId === storeB.id, "reassign B persisted");

  const catB = await getPosCatalog({
    companyId: company.id,
    storeId: afterB!.storeId!,
    q: product.name,
  });
  assert(
    !catB.items.some((i) => i.productId === product.id),
    "POS catalog B does not see A-only stock"
  );

  // Restore seller to storeA for other tests
  await assignStoreStaff({
    companyId: company.id,
    storeId: storeA.id,
    userId: seller.id,
    actorId: owner.id,
  });

  console.log("PASS: assign / unassign / reassign → DB + POS catalog sync");
  console.log(`  seller=${seller.email} A=${storeA.name} B=${storeB.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
