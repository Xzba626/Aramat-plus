/**
 * Mandatory: Seller POS must see ONLY own store stock after transfer.
 * Warehouse qty must NEVER appear in getPosCatalog.
 *
 * Scenario:
 *   Warehouse: Dior Sauvage 1000 ml
 *   Transfer 300 ml → Store #1
 *   Seller Store #1 → sees 300 ml (not 1000)
 *   Store #2 → does not see the product (or qty 0)
 *
 * Run: npm run test:seller-isolation
 */
import {
  PrismaClient,
  AccountingType,
  LocationType,
  Role,
  StoreKind,
} from "@prisma/client";
import { addBatch, getQtyAtLocation } from "../src/lib/services/stock.service";
import { createTransfer } from "../src/lib/services/transfer.service";
import { getPosCatalog } from "../src/lib/services/pos-catalog.service";
import { getWarehouseStock } from "../src/lib/services/stock.service";

const prisma = new PrismaClient();

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function cleanupProduct(productId: string) {
  await prisma.saleItem.deleteMany({ where: { productId } });
  await prisma.sale.deleteMany({
    where: { items: { some: { productId } } },
  });
  await prisma.transferItem.deleteMany({ where: { productId } });
  await prisma.batch.deleteMany({ where: { productId } });
  await prisma.stockBalance.deleteMany({ where: { productId } });
  await prisma.product.delete({ where: { id: productId } });
}

async function main() {
  console.log("=== Seller Isolation Test ===\n");

  const company = await prisma.company.findFirst();
  assert(company, "company");

  const warehouse = await prisma.warehouse.findFirst({
    where: { companyId: company.id, isActive: true },
  });
  assert(warehouse, "warehouse");

  const owner = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.OWNER },
  });
  assert(owner, "owner");

  const tag = `Isolation-${Date.now()}`;
  const store1 = await prisma.store.create({
    data: {
      name: `${tag} Store 1`,
      companyId: company.id,
      kind: StoreKind.BRANCH,
      isActive: true,
      openedAt: new Date(),
    },
  });
  const store2 = await prisma.store.create({
    data: {
      name: `${tag} Store 2`,
      companyId: company.id,
      kind: StoreKind.BRANCH,
      isActive: true,
      openedAt: new Date(),
    },
  });

  const product = await prisma.product.create({
    data: {
      name: `${tag} Dior Sauvage`,
      companyId: company.id,
      accountingType: AccountingType.WEIGHT,
      salePrice: 4,
      minStock: 50,
    },
  });

  try {
    await prisma.$transaction(async (tx) => {
      await addBatch(tx, {
        productId: product.id,
        locationType: LocationType.WAREHOUSE,
        locationId: warehouse.id,
        quantity: 1000,
        costPerUnit: 2,
        notes: "seller-isolation-wh",
      });
    });

    const whQty = await getQtyAtLocation({
      productId: product.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
    });
    assert(whQty === 1000, `warehouse 1000 ml, got ${whQty}`);
    console.log("1. Warehouse receive 1000 ml OK");

    await createTransfer({
      companyId: company.id,
      fromWarehouseId: warehouse.id,
      toStoreId: store1.id,
      createdById: owner.id,
      items: [{ productId: product.id, quantity: 300 }],
    });

    const st1Qty = await getQtyAtLocation({
      productId: product.id,
      locationType: LocationType.STORE,
      locationId: store1.id,
    });
    const whAfter = await getQtyAtLocation({
      productId: product.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
    });
    assert(st1Qty === 300, `store1 300 ml, got ${st1Qty}`);
    assert(whAfter === 700, `warehouse 700 ml after transfer, got ${whAfter}`);
    console.log("2. Transfer 300 ml → Store #1 OK (wh=700)");

    const catalog1 = await getPosCatalog({
      companyId: company.id,
      storeId: store1.id,
      q: product.name,
    });
    const pos1 = catalog1.items.find((i) => i.productId === product.id);
    assert(pos1, "Store #1 POS catalog contains product");
    assert(
      pos1.quantity === 300,
      `Store #1 seller sees 300 ml, got ${pos1.quantity}`
    );
    assert(
      pos1.physicalQty === 300,
      `Store #1 physicalQty must be store-only, got ${pos1.physicalQty}`
    );
    assert(
      pos1.quantity !== 1000 && pos1.physicalQty !== 1000,
      "Seller must NOT see warehouse total 1000 ml"
    );
    assert(
      pos1.quantity !== 700,
      "Seller must NOT see remaining warehouse 700 ml"
    );
    console.log("3. Store #1 seller sees 300 ml only (not warehouse) OK");

    const catalog2 = await getPosCatalog({
      companyId: company.id,
      storeId: store2.id,
      q: product.name,
    });
    const pos2 = catalog2.items.find((i) => i.productId === product.id);
    assert(!pos2, "Store #2 must not list product without transfer");
    console.log("4. Store #2 sees nothing OK");

    const whStock = await getWarehouseStock(company.id, warehouse.id);
    const whItem = whStock.items.find((i) => i.productId === product.id);
    assert(whItem, "warehouse stock row exists for owner");
    const whCatalogQty = Number(whItem!.quantity);
    assert(whCatalogQty === 700, `owner warehouse view 700, got ${whCatalogQty}`);
    assert(
      pos1!.quantity < whCatalogQty,
      "POS qty must be store stock (300), not warehouse remainder (700)"
    );
    console.log("5. Warehouse 700 ml exists only for owner path, not POS OK");

    console.log("\nSELLER ISOLATION PASSED");
    console.log(
      "Architecture: Warehouse → Transfer → Store Stock → Seller POS ✓"
    );
  } finally {
    await cleanupProduct(product.id);
    // Transfers RESTRICT store delete — archive instead of hard delete
    await prisma.store.updateMany({
      where: { id: { in: [store1.id, store2.id] } },
      data: { isActive: false, isArchived: true },
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
