/**
 * Product Vision Block 1: discount cart → approve → sale 90.
 * Run: npx tsx scripts/test-discount-flow.ts
 */
import {
  PrismaClient,
  AccountingType,
  Role,
  StoreKind,
  LocationType,
} from "@prisma/client";
import { addBatch, getQtyAtLocation } from "../src/lib/services/stock.service";
import { createSale } from "../src/lib/services/sale.service";
import {
  createDiscountRequest,
  decideDiscountRequest,
} from "../src/lib/services/discount-request.service";

const prisma = new PrismaClient();

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

async function main() {
  console.log("=== Discount flow: 100 → request −10 → approve → sale 90 ===\n");

  const company = await prisma.company.findFirst();
  assert(company, "company");
  const owner = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.OWNER },
  });
  assert(owner, "owner");
  const store = await prisma.store.findFirst({
    where: { companyId: company.id, kind: StoreKind.BRANCH, isActive: true },
  });
  assert(store, "store");
  let seller = await prisma.user.findFirst({
    where: { companyId: company.id, role: Role.SELLER, storeId: store.id },
  });
  if (!seller) {
    seller = await prisma.user.findFirst({
      where: { companyId: company.id, role: Role.SELLER },
    });
    if (seller) {
      await prisma.user.update({
        where: { id: seller.id },
        data: { storeId: store.id },
      });
    }
  }
  assert(seller, "seller");

  const product = await prisma.product.create({
    data: {
      name: `DiscFlow ${Date.now()}`,
      companyId: company.id,
      accountingType: AccountingType.PIECE,
      salePrice: 100,
      minStock: 1,
    },
  });

  await prisma.$transaction(async (tx) => {
    await addBatch(tx, {
      productId: product.id,
      locationType: LocationType.STORE,
      locationId: store.id,
      quantity: 5,
      costPerUnit: 40,
      salePrice: 100,
      notes: "discount-flow",
    });
  });

  const items = [{ productId: product.id, quantity: 1, salePrice: 100 }];
  const req = await createDiscountRequest({
    companyId: company.id,
    requesterId: seller.id,
    storeId: store.id,
    originalAmount: 100,
    amount: 10,
    percent: 10,
    reason: "Клиент просит 90",
    items,
  });
  assert(req.status === "PENDING", "pending");
  assert(req.finalAmount === 90, `final 90 got ${req.finalAmount}`);
  console.log("✓ Request 100 → −10 → 90 PENDING");

  let blocked = false;
  try {
    await createSale({
      companyId: company.id,
      storeId: store.id,
      sellerId: seller.id,
      items: [{ productId: product.id, quantity: 1 }],
      discountRequestId: req.id,
      enforceApprovedDiscount: true,
    });
  } catch (e) {
    blocked =
      e instanceof Error && e.message === "DISCOUNT_NOT_APPROVED";
  }
  assert(blocked, "cannot sell with PENDING discount");
  console.log("✓ Sale blocked while PENDING");

  await decideDiscountRequest({
    companyId: company.id,
    requestId: req.id,
    reviewerId: owner.id,
    decision: "APPROVE",
  });
  console.log("✓ Owner APPROVE");

  blocked = false;
  try {
    await createSale({
      companyId: company.id,
      storeId: store.id,
      sellerId: seller.id,
      items: [{ productId: product.id, quantity: 1 }],
      discountAmount: 10,
      enforceApprovedDiscount: true,
    });
  } catch (e) {
    blocked =
      e instanceof Error && e.message === "DISCOUNT_REQUIRES_APPROVAL";
  }
  assert(blocked, "seller cannot pass raw discountAmount");
  console.log("✓ Raw discountAmount forbidden for seller path");

  const sale = await createSale({
    companyId: company.id,
    storeId: store.id,
    sellerId: seller.id,
    items: [{ productId: product.id, quantity: 1 }],
    discountRequestId: req.id,
    enforceApprovedDiscount: true,
  });
  assert(sale.originalAmount === 100, `original 100 got ${sale.originalAmount}`);
  assert(sale.discountAmount === 10, `discount 10 got ${sale.discountAmount}`);
  assert(sale.finalAmount === 90, `final 90 got ${sale.finalAmount}`);
  assert(Number(sale.total) === 90, `total 90 got ${sale.total}`);
  assert(sale.discountRequestId === req.id, "linked request");
  assert(sale.discountApprovedById === owner.id, "approvedBy owner");
  console.log("✓ Sale 90 with original/discount/final + approvedBy");

  // New stock for cart-change case
  const product2 = await prisma.product.create({
    data: {
      name: `DiscChange ${Date.now()}`,
      companyId: company.id,
      accountingType: AccountingType.PIECE,
      salePrice: 50,
      minStock: 1,
    },
  });
  await prisma.$transaction(async (tx) => {
    await addBatch(tx, {
      productId: product.id,
      locationType: LocationType.STORE,
      locationId: store.id,
      quantity: 3,
      costPerUnit: 40,
      salePrice: 100,
      notes: "discount-change",
    });
    await addBatch(tx, {
      productId: product2.id,
      locationType: LocationType.STORE,
      locationId: store.id,
      quantity: 3,
      costPerUnit: 20,
      salePrice: 100,
      notes: "discount-change-2",
    });
  });

  const req3 = await createDiscountRequest({
    companyId: company.id,
    requesterId: seller.id,
    storeId: store.id,
    originalAmount: 100,
    amount: 10,
    reason: "then change cart",
    items: [{ productId: product.id, quantity: 1, salePrice: 100 }],
  });
  await decideDiscountRequest({
    companyId: company.id,
    requestId: req3.id,
    reviewerId: owner.id,
    decision: "APPROVE",
  });
  let cartChanged = false;
  try {
    await createSale({
      companyId: company.id,
      storeId: store.id,
      sellerId: seller.id,
      items: [
        { productId: product.id, quantity: 1 },
        { productId: product2.id, quantity: 1 },
      ],
      discountRequestId: req3.id,
      enforceApprovedDiscount: true,
    });
  } catch (e) {
    cartChanged = e instanceof Error && e.message === "CART_CHANGED";
  }
  assert(cartChanged, "adding item after approve must CART_CHANGED");
  console.log("✓ Cart change after approve → CART_CHANGED (скидка недействительна)");

  const linked = await prisma.discountRequest.findUniqueOrThrow({
    where: { id: req.id },
  });
  assert(linked.saleId === sale.id, "request.saleId set");
  assert(linked.status === "APPROVED", "still APPROVED");

  const logs = await prisma.activityLog.findMany({
    where: {
      companyId: company.id,
      action: { in: ["DISCOUNT_REQUEST", "DISCOUNT_APPROVE", "SALE_CREATE"] },
      OR: [{ entityId: req.id }, { entityId: sale.id }],
    },
  });
  assert(logs.length >= 2, "activity logs");
  console.log("✓ ActivityLog present");

  // Reject path: new request
  const req2 = await createDiscountRequest({
    companyId: company.id,
    requesterId: seller.id,
    storeId: store.id,
    originalAmount: 100,
    amount: 15,
    reason: "try reject",
    items: [{ productId: product.id, quantity: 1, salePrice: 100 }],
  });
  await decideDiscountRequest({
    companyId: company.id,
    requestId: req2.id,
    reviewerId: owner.id,
    decision: "REJECT",
  });
  blocked = false;
  try {
    await createSale({
      companyId: company.id,
      storeId: store.id,
      sellerId: seller.id,
      items: [{ productId: product.id, quantity: 1 }],
      discountRequestId: req2.id,
      enforceApprovedDiscount: true,
    });
  } catch (e) {
    blocked =
      e instanceof Error && e.message === "DISCOUNT_NOT_APPROVED";
  }
  assert(blocked, "rejected discount cannot be used");
  console.log("✓ Rejected discount cannot sell at reduced price");

  await prisma.discountRequest.deleteMany({
    where: {
      OR: [{ id: req.id }, { id: req2.id }, { id: req3.id }],
    },
  });
  await prisma.saleItem.deleteMany({
    where: { productId: { in: [product.id, product2.id] } },
  });
  await prisma.sale.deleteMany({
    where: {
      items: { some: { productId: { in: [product.id, product2.id] } } },
    },
  });
  await prisma.batch.deleteMany({
    where: { productId: { in: [product.id, product2.id] } },
  });
  await prisma.stockBalance.deleteMany({
    where: { productId: { in: [product.id, product2.id] } },
  });
  await prisma.product.deleteMany({
    where: { id: { in: [product.id, product2.id] } },
  });

  console.log("\nDISCOUNT FLOW PASSED");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
