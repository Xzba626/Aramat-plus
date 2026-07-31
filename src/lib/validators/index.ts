import { AccountingType, Role, StoreStatus } from "@prisma/client";
import { z } from "zod";

export const categorySchema = z.object({
  name: z.string().min(1).max(120),
  lowStockThreshold: z.coerce.number().min(0).optional(),
});

export const brandSchema = z.object({
  name: z.string().min(1).max(120),
  imageUrl: z.string().max(500).optional().nullable(),
});

export const supplierSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().max(40).optional().nullable(),
  comment: z.string().max(500).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const unitSchema = z.object({
  name: z.string().min(1).max(120),
  symbol: z.string().min(1).max(20),
});

export const productTypeSchema = z.object({
  name: z.string().min(1).max(120),
});

export const operationTypeSchema = z.object({
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(60),
});

export const expenseTypeSchema = z.object({
  name: z.string().min(1).max(120),
});

export const productSchema = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().max(80).optional().nullable(),
  barcode: z.string().max(80).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  brandId: z.string().optional().nullable(),
  unitId: z.string().optional().nullable(),
  productTypeId: z.string().optional().nullable(),
  accountingType: z.nativeEnum(AccountingType).default(AccountingType.PIECE),
  salePrice: z.coerce.number().positive(),
  defaultCostPerUnit: z.coerce.number().positive().optional().nullable(),
  minStock: z.coerce.number().min(0).optional(),
});

export const batchSchema = z.object({
  quantity: z.coerce.number().positive(),
  costPerUnit: z.coerce.number().positive(),
  receivedAt: z.coerce.date().optional(),
  notes: z.string().max(500).optional().nullable(),
  supplierId: z.string().cuid().optional().nullable(),
});

export const priceSchema = z.object({
  salePrice: z.coerce.number().positive(),
});

export const storeSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(300).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  workingHours: z.string().max(200).optional().nullable(),
  isActive: z.boolean().optional(),
  status: z.nativeEnum(StoreStatus).optional(),
  managerId: z.string().optional().nullable(),
  notifyLowStock: z.boolean().optional(),
  notifyRequests: z.boolean().optional(),
  isArchived: z.boolean().optional(),
  /** Existing users to bind on create (Stage 3.1) */
  sellerIds: z.array(z.string().min(1)).optional(),
});

export const userCreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  password: z.string().min(4).max(100),
  role: z.nativeEnum(Role),
  storeId: z.string().optional().nullable(),
});

export const userUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  role: z.nativeEnum(Role).optional(),
  storeId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  password: z.string().min(4).max(100).optional(),
});

export const transferSchema = z.object({
  fromWarehouseId: z.string().min(1),
  toStoreId: z.string().min(1),
  notes: z.string().max(500).optional().nullable(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().positive(),
      })
    )
    .min(1),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(4).max(100),
});

export const resetPasswordSchema = z.object({
  userId: z.string().min(1),
  newPassword: z.string().min(4).max(100),
});

export const saleSchema = z.object({
  storeId: z.string().min(1).optional(),
  paymentMethod: z.string().max(40).optional(),
  discountAmount: z.coerce.number().min(0).optional(),
  notes: z.string().max(500).optional().nullable(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().positive(),
        isGift: z.boolean().optional(),
      })
    )
    .min(1),
});
