import { PrismaClient, AccountingType, Role, LocationType, StoreKind } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Aromat Plus…");

  await prisma.activityLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.transferItem.deleteMany();
  await prisma.transfer.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.stockBalance.deleteMany();
  await prisma.priceHistory.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.packagingSku.deleteMany();
  await prisma.giftRule.deleteMany();
  await prisma.discountRequest.deleteMany();
  await prisma.saleReturn.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.inventorySession.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.setting.deleteMany();
  await prisma.user.deleteMany();
  await prisma.store.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.category.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.productType.deleteMany();
  await prisma.operationType.deleteMany();
  await prisma.expenseType.deleteMany();
  await prisma.company.deleteMany();

  const company = await prisma.company.create({
    data: { name: "Aromat Plus", currency: "TJS" },
  });

  const warehouse = await prisma.warehouse.create({
    data: { name: "Центральный склад", companyId: company.id },
  });

  const [catPerfume, catGift] = await Promise.all([
    prisma.category.create({
      data: { name: "Духи", companyId: company.id, lowStockThreshold: 50 },
    }),
    prisma.category.create({
      data: { name: "Подарки", companyId: company.id, lowStockThreshold: 5 },
    }),
  ]);

  const [brandAlRehab, brandHamidi, brandSurrati] = await Promise.all([
    prisma.brand.create({ data: { name: "Al Rehab", companyId: company.id } }),
    prisma.brand.create({ data: { name: "Hamidi", companyId: company.id } }),
    prisma.brand.create({ data: { name: "Surrati", companyId: company.id } }),
  ]);

  const [unitMl, unitPcs] = await Promise.all([
    prisma.unit.create({
      data: { name: "Миллилитр", symbol: "мл", companyId: company.id },
    }),
    prisma.unit.create({
      data: { name: "Штука", symbol: "шт", companyId: company.id },
    }),
  ]);

  await Promise.all([
    prisma.productType.create({ data: { name: "Парфюм", companyId: company.id } }),
    prisma.productType.create({ data: { name: "Масляные духи", companyId: company.id } }),
    prisma.productType.create({ data: { name: "Дезодорант", companyId: company.id } }),
    prisma.productType.create({ data: { name: "Освежитель воздуха", companyId: company.id } }),
    prisma.productType.create({ data: { name: "Часы", companyId: company.id } }),
    prisma.productType.create({ data: { name: "Аксессуары", companyId: company.id } }),
    prisma.productType.create({ data: { name: "Подарки", companyId: company.id } }),
    prisma.productType.create({ data: { name: "Другое", companyId: company.id } }),
    prisma.operationType.create({
      data: { name: "Перемещение", code: "TRANSFER", companyId: company.id },
    }),
    prisma.operationType.create({
      data: { name: "Продажа", code: "SALE", companyId: company.id },
    }),
    prisma.expenseType.create({ data: { name: "Аренда", companyId: company.id } }),
    prisma.expenseType.create({ data: { name: "Зарплата", companyId: company.id } }),
    prisma.expenseType.create({ data: { name: "Коммунальные", companyId: company.id } }),
    prisma.expenseType.create({ data: { name: "Интернет", companyId: company.id } }),
    prisma.expenseType.create({ data: { name: "Прочие", companyId: company.id } }),
    prisma.expenseType.create({ data: { name: "Флаконы", companyId: company.id } }),
  ]);

  const store1 = await prisma.store.create({
    data: {
      name: "Магазин №1 — Сино",
      address: "Сино",
      companyId: company.id,
      kind: StoreKind.BRANCH,
    },
  });
  const store2 = await prisma.store.create({
    data: {
      name: "Магазин №2 — Рудаки",
      address: "Рудаки",
      companyId: company.id,
      kind: StoreKind.BRANCH,
    },
  });

  const ownerDirect = await prisma.store.create({
    data: {
      name: "Личные продажи владельца",
      address: "Центральный склад · прямые продажи",
      companyId: company.id,
      kind: StoreKind.OWNER_DIRECT,
    },
  });

  const ownerHash = await bcrypt.hash("owner1234", 10);
  const managerHash = await bcrypt.hash("manager1234", 10);
  const sellerHash = await bcrypt.hash("seller1234", 10);

  const owner = await prisma.user.create({
    data: {
      email: "owner@aromat.plus",
      name: "Владелец",
      passwordHash: ownerHash,
      role: Role.OWNER,
      companyId: company.id,
    },
  });

  await prisma.user.create({
    data: {
      email: "manager@aromat.plus",
      name: "Менеджер",
      passwordHash: managerHash,
      role: Role.MANAGER,
      companyId: company.id,
    },
  });

  await prisma.user.create({
    data: {
      email: "seller@aromat.plus",
      name: "Фарход",
      passwordHash: sellerHash,
      role: Role.SELLER,
      companyId: company.id,
      storeId: store1.id,
    },
  });

  const p1 = await prisma.product.create({
    data: {
      name: "Духи Al Rehab Amber",
      companyId: company.id,
      categoryId: catPerfume.id,
      brandId: brandAlRehab.id,
      unitId: unitMl.id,
      accountingType: AccountingType.WEIGHT,
      salePrice: 25,
    },
  });

  const p2 = await prisma.product.create({
    data: {
      name: "Масло Уд Royal",
      companyId: company.id,
      categoryId: catPerfume.id,
      brandId: brandHamidi.id,
      unitId: unitMl.id,
      accountingType: AccountingType.WEIGHT,
      salePrice: 60,
    },
  });

  const p3 = await prisma.product.create({
    data: {
      name: "Дезодорант-стик Musk",
      companyId: company.id,
      categoryId: catGift.id,
      brandId: brandSurrati.id,
      unitId: unitPcs.id,
      accountingType: AccountingType.PIECE,
      salePrice: 18,
    },
  });

  // Two separate batches for p1 (different costs — must NOT merge)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  await prisma.batch.create({
    data: {
      productId: p1.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 100,
      initialQuantity: 100,
      costPerUnit: 100,
      receivedAt: weekAgo,
      notes: "Партия №1",
      createdById: owner.id,
    },
  });
  await prisma.batch.create({
    data: {
      productId: p1.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 150,
      initialQuantity: 150,
      costPerUnit: 120,
      receivedAt: new Date(),
      notes: "Партия №2",
      createdById: owner.id,
    },
  });
  await prisma.stockBalance.create({
    data: {
      productId: p1.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 250,
    },
  });

  await prisma.batch.create({
    data: {
      productId: p2.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 320,
      initialQuantity: 320,
      costPerUnit: 30,
      notes: "Партия №1",
      createdById: owner.id,
    },
  });
  await prisma.stockBalance.create({
    data: {
      productId: p2.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 320,
    },
  });

  await prisma.batch.create({
    data: {
      productId: p3.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 140,
      initialQuantity: 140,
      costPerUnit: 8,
      notes: "Партия №1",
      createdById: owner.id,
    },
  });
  await prisma.stockBalance.create({
    data: {
      productId: p3.id,
      locationType: LocationType.WAREHOUSE,
      locationId: warehouse.id,
      quantity: 140,
    },
  });

  // Store №1 starter stock — sequential (no interactive $transaction).
  // createTransfer uses prisma.$transaction(async tx => …); on Neon *pooler*
  // URLs that throws P2028 "Transaction not found". Seed stays re-runnable via deleteMany.
  const seedTransferLines = [
    { productId: p1.id, quantity: 30 },
    { productId: p3.id, quantity: 20 },
  ];

  const seedTransfer = await prisma.transfer.create({
    data: {
      fromWarehouseId: warehouse.id,
      toStoreId: store1.id,
      createdById: owner.id,
      status: "COMPLETED",
      notes: "Seed: стартовые остатки Магазин №1",
    },
  });

  for (const line of seedTransferLines) {
    const whBatch = await prisma.batch.findFirst({
      where: {
        productId: line.productId,
        locationType: LocationType.WAREHOUSE,
        locationId: warehouse.id,
        quantity: { gt: 0 },
      },
      orderBy: { receivedAt: "asc" },
    });
    if (!whBatch || Number(whBatch.quantity) < line.quantity) {
      throw new Error(`Seed: недостаточно склада для ${line.productId}`);
    }

    await prisma.batch.update({
      where: { id: whBatch.id },
      data: { quantity: { decrement: line.quantity } },
    });
    await prisma.stockBalance.update({
      where: {
        productId_locationType_locationId: {
          productId: line.productId,
          locationType: LocationType.WAREHOUSE,
          locationId: warehouse.id,
        },
      },
      data: { quantity: { decrement: line.quantity } },
    });

    const transferItem = await prisma.transferItem.create({
      data: {
        transferId: seedTransfer.id,
        productId: line.productId,
        quantity: line.quantity,
        sourceBatchId: whBatch.id,
        costPerUnit: whBatch.costPerUnit,
      },
    });

    await prisma.batch.create({
      data: {
        productId: line.productId,
        locationType: LocationType.STORE,
        locationId: store1.id,
        quantity: line.quantity,
        initialQuantity: line.quantity,
        costPerUnit: whBatch.costPerUnit,
        notes: `Seed transfer ${seedTransfer.id}`,
        transferItemId: transferItem.id,
        createdById: owner.id,
      },
    });
    await prisma.stockBalance.create({
      data: {
        productId: line.productId,
        locationType: LocationType.STORE,
        locationId: store1.id,
        quantity: line.quantity,
      },
    });
  }

  console.log("Seed complete.");
  console.log("  Owner:   owner@aromat.plus / owner1234");
  console.log("  Manager: manager@aromat.plus / manager1234");
  console.log("  Seller:  seller@aromat.plus / seller1234");
  console.log(`  Warehouse: ${warehouse.name}`);
  console.log(`  Stores: ${ownerDirect.name}, ${store1.name}, ${store2.name}`);
  console.log("  Store №1 seed stock: Amber 30 + Musk 20 (via transfer)");

  const { ensureDefaultPackagingSkus } = await import(
    "../src/lib/services/packaging.service"
  );
  await ensureDefaultPackagingSkus(company.id);
  console.log("  Packaging: default glass Skus 5/10/30/50/100 ml");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
