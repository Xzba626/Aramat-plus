import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Never leak raw Prisma / stack traces to the client. */
export function handleApiError(err: unknown) {
  if (err instanceof ZodError) {
    const unsafe = err.issues.find((i) => i.message === "UNSAFE_INPUT");
    if (unsafe) {
      return jsonError("UNSAFE_INPUT", 400);
    }
    const imageIssue = err.issues.find(
      (i) =>
        i.message === "IMAGE_URL_INVALID" ||
        i.path.includes("imageUrl")
    );
    if (imageIssue?.message === "IMAGE_URL_INVALID") {
      return jsonError("IMAGE_URL_INVALID", 400);
    }
    if (
      imageIssue &&
      err.issues.every(
        (i) => i.path.includes("imageUrl") || i.message === "IMAGE_URL_INVALID"
      )
    ) {
      return jsonError("IMAGE_URL_INVALID", 400);
    }
    return jsonError("VALIDATION_ERROR", 400);
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    console.error("[api] Prisma", err.code, err.message, err.meta);
    if (err.code === "P2002") {
      return jsonError("RECORD_EXISTS", 409);
    }
    if (err.code === "P2025") {
      return jsonError("NOT_FOUND", 404);
    }
    if (err.code === "P2022") {
      return jsonError("DB_SCHEMA_MISMATCH", 503);
    }
    return jsonError("DB_ERROR", 500);
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    console.error("[api] Prisma validation", err.message);
    return jsonError("VALIDATION_ERROR", 400);
  }

  if (err instanceof Error) {
    console.error("[api]", err.message, err.stack);
    const safeCodes = new Set([
      "ARCHIVE_ONLY",
      "BATCH_QTY_MUST_BE_POSITIVE",
      "BOTTLE_NOT_FOUND",
      "BOTTLE_REQUIRED",
      "PACKAGING_DUPLICATE",
      "CONTAINER_SOURCE_REQUIRED",
      "BRANCH_NOT_FOUND",
      "BRAND_NAME_REQUIRED",
      "BRAND_NOT_FOUND",
      "COST_REQUIRED_FOR_STOCK",
      "CART_CHANGED",
      "CART_TOTAL_MISMATCH",
      "CATEGORY_IN_USE",
      "DISCOUNT_ALREADY_USED",
      "DISCOUNT_EXCEEDS_TOTAL",
      "DISCOUNT_NOT_APPROVED",
      "DISCOUNT_NOT_FOUND",
      "DISCOUNT_REQUIRES_APPROVAL",
      "DISCOUNT_WRONG_STORE",
      "EMPTY_CART",
      "FILE_REQUIRED",
      "FILE_TOO_LARGE",
      "FORBIDDEN",
      "ID_REQUIRED",
      "IMAGE_PROCESS_FAILED",
      "IMAGE_URL_INVALID",
      "IMAGE_HEIC_UNSUPPORTED",
      "IMAGE_COMPRESS_FAILED",
      "IMAGE_STORAGE_UNCONFIGURED",
      "INVALID_FILE_TYPE",
      "INSUFFICIENT_AVAILABLE",
      "INSUFFICIENT_BATCH_STOCK",
      "INSUFFICIENT_STOCK",
      "NEGATIVE_DISCOUNT",
      "NOT_FOUND",
      "PACKAGING_NOT_ALLOWED",
      "PRODUCT_HAS_HISTORY",
      "PRODUCT_NOT_FOUND",
      "PRODUCT_REQUIRED",
      "PRODUCT_SIMILAR",
      "PRODUCT_TYPE_NOT_FOUND",
      "QTY_MUST_BE_POSITIVE",
      "RESERVATION_EXPIRED",
      "RESERVATION_NOT_ACTIVE",
      "RESERVATION_NOT_FOUND",
      "RESERVATION_QTY_MISMATCH",
      "RESERVATION_WRONG_STORE",
      "REVISION_ALREADY_OPEN",
      "REVISION_COUNTS_INCOMPLETE",
      "RETURN_ALREADY_PENDING",
      "SELLER_NO_STORE",
      "SELLER_POS_BRANCH_ONLY",
      "SELLER_WRONG_STORE",
      "STORE_NOT_FOUND",
      "STORE_INVENTORY_IN_PROGRESS",
      "STORE_CLOSED",
      "STORE_REQUIRED_FOR_RECURRING",
      "SUPPLIER_NOT_FOUND",
      "TRANSFER_BRANCH_ONLY",
      "UNAUTHORIZED",
      "UNSAFE_INPUT",
      "USE_PRICE_ENDPOINT",
      "USER_NOT_FOUND",
      "VALIDATION_ERROR",
      "WAREHOUSE_MISSING",
      "WRONG_PASSWORD",
      "WRONG_MASTER_PASSWORD",
      "MASTER_PASSWORD_REQUIRED",
      "WIPE_PHRASE_MISMATCH",
      "ACCOUNT_LOCKED",
      "RATE_LIMITED",
      "RETURN_QTY_EXCEEDS",
      "RETURN_ITEMS_REQUIRED",
    ]);
    if (safeCodes.has(err.message)) {
      const status =
        err.message === "UNAUTHORIZED"
          ? 401
          : err.message === "FORBIDDEN"
            ? 403
            : err.message === "RATE_LIMITED"
              ? 429
            : err.message === "NOT_FOUND" ||
                err.message === "PRODUCT_NOT_FOUND" ||
                err.message === "STORE_NOT_FOUND" ||
                err.message === "BRANCH_NOT_FOUND" ||
                err.message === "USER_NOT_FOUND" ||
                err.message === "BRAND_NOT_FOUND" ||
                err.message === "WAREHOUSE_MISSING"
              ? 404
              : 400;
      return jsonError(err.message, status);
    }
    // Never forward raw / localized / Prisma messages to the client
    if (/prisma|invocation|column|relation/i.test(err.message)) {
      return jsonError("DB_ERROR", 500);
    }
    return jsonError("INTERNAL_ERROR", 500);
  }

  console.error("[api] Unknown error", err);
  return jsonError("INTERNAL_ERROR", 500);
}
