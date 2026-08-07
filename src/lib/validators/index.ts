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

export const giftRuleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  productId: z.string().cuid().optional().nullable(),
  minQuantity: z.coerce.number().positive().optional().nullable(),
  giftProductId: z.string().cuid(),
  giftQuantity: z.coerce.number().positive().optional(),
  isActive: z.boolean().optional(),
});

export const productSchema = z.object({
  name: z.string().min(1).max(200),
  sku: z.string().max(80).optional().nullable(),
  barcode: z.string().max(80).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  imageUrl: z
    .string()
    .max(2048)
    .optional()
    .nullable()
    .refine(
      (v) =>
        v == null ||
        v === "" ||
        v.startsWith("/uploads/") ||
        (/^https:\/\//i.test(v) &&
          /\.(webp|jpe?g|png|gif)(\?.*)?$/i.test(v)) ||
        (v.startsWith("data:image/") && v.length <= 12_000),
      { message: "IMAGE_URL_INVALID" }
    ),
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
  /** Sale price for THIS new batch only (immutable). Defaults to Product.salePrice catalog. */
  salePrice: z.coerce.number().min(0).optional(),
  receivedAt: z.coerce.date().optional(),
  notes: z.string().max(500).optional().nullable(),
  // Kept for API/DB compat — UI no longer sends suppliers (Part 4).
  supplierId: z.string().cuid().optional().nullable(),
  /** When true (or salePrice sent), update Product.salePrice catalog only — never old batches. */
  updateCatalogPrice: z.boolean().optional(),
});

export const priceSchema = z.object({
  salePrice: z.coerce.number().positive(),
  reason: z.string().min(1).max(300),
});

export const costSchema = z.object({
  defaultCostPerUnit: z.coerce.number().positive().nullable(),
  reason: z.string().min(1).max(300),
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

export const ASSIGNABLE_ROLES = [Role.ADMIN, Role.MANAGER, Role.SELLER] as const;

export const userCreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(100),
  role: z.enum(ASSIGNABLE_ROLES),
  storeId: z.string().optional().nullable(),
});

export const userUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  role: z.enum(ASSIGNABLE_ROLES).optional(),
  storeId: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).max(100).optional(),
});

export const transferSchema = z.object({
  fromWarehouseId: z.string().min(1).optional(),
  fromStoreId: z.string().min(1).optional(),
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

/** Owner: restore pre-system store stock via WH→Store FIFO. */
export const initialStoreStockSchema = z
  .object({
    quantity: z.coerce.number().positive(),
    productId: z.string().min(1).optional(),
    forceCreate: z.boolean().optional(),
    newProduct: z
      .object({
        name: z.string().min(1).max(200),
        brandId: z.string().min(1).optional().nullable(),
        categoryId: z.string().min(1).optional().nullable(),
        productTypeId: z.string().min(1).optional().nullable(),
        accountingType: z.nativeEnum(AccountingType),
        salePrice: z.coerce.number().positive(),
        costPerUnit: z.coerce.number().positive(),
      })
      .optional(),
  })
  .superRefine((v, ctx) => {
    const hasExisting = Boolean(v.productId);
    const hasNew = Boolean(v.newProduct);
    if (hasExisting === hasNew) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "PRODUCT_REQUIRED",
      });
    }
  });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});

export const resetPasswordSchema = z.object({
  userId: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});

export const saleSchema = z.object({
  storeId: z.string().min(1).optional(),
  paymentMethod: z.string().max(40).optional(),
  discountAmount: z.coerce.number().min(0).optional(),
  discountRequestId: z.string().min(1).optional(),
  reservationId: z.string().min(1).optional(),
  notes: z.string().max(500).optional().nullable(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().positive(),
        isGift: z.boolean().optional(),
        containerSource: z
          .enum(["STORE_BOTTLE", "CUSTOMER_BOTTLE"])
          .optional(),
        packagingProductId: z.string().min(1).optional(),
        packagingSkuId: z.string().min(1).optional(),
      })
    )
    .min(1),
});

export const reservationCreateSchema = z.object({
  storeId: z.string().min(1).optional(),
  customerNote: z.string().max(500).optional().nullable(),
  ttlMinutes: z.coerce.number().min(5).max(24 * 60).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().positive(),
      })
    )
    .min(1),
});

export const packagingSkuSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  volumeMl: z.coerce.number().positive(),
  material: z.enum(["glass", "plastic"]).optional().nullable(),
  color: z.string().max(60).optional().nullable(),
  skuCode: z.string().max(80).optional().nullable(),
  defaultCost: z.coerce.number().nonnegative().optional().nullable(),
  isDefaultForVolume: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const packagingSkuUpdateSchema = packagingSkuSchema.partial().extend({
  id: z.string().min(1),
});
