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
      "BRANCH_NOT_FOUND",
      "BRAND_NAME_REQUIRED",
      "BRAND_NOT_FOUND",
      "COST_REQUIRED_FOR_STOCK",
      "DISCOUNT_EXCEEDS_TOTAL",
      "EMPTY_CART",
      "FORBIDDEN",
      "ID_REQUIRED",
      "INSUFFICIENT_BATCH_STOCK",
      "INSUFFICIENT_STOCK",
      "NEGATIVE_DISCOUNT",
      "NOT_FOUND",
      "PRODUCT_NOT_FOUND",
      "PRODUCT_TYPE_NOT_FOUND",
      "QTY_MUST_BE_POSITIVE",
      "REVISION_ALREADY_OPEN",
      "RETURN_ALREADY_PENDING",
      "SELLER_NO_STORE",
      "SELLER_POS_BRANCH_ONLY",
      "SELLER_WRONG_STORE",
      "STORE_NOT_FOUND",
      "STORE_REQUIRED_FOR_RECURRING",
      "SUPPLIER_NOT_FOUND",
      "TRANSFER_BRANCH_ONLY",
      "UNAUTHORIZED",
      "USE_PRICE_ENDPOINT",
      "USER_NOT_FOUND",
      "VALIDATION_ERROR",
      "WAREHOUSE_MISSING",
      "WRONG_PASSWORD",
      "ACCOUNT_LOCKED",
      "RETURN_QTY_EXCEEDS",
      "RETURN_ITEMS_REQUIRED",
    ]);
    if (safeCodes.has(err.message)) {
      const status =
        err.message === "UNAUTHORIZED"
          ? 401
          : err.message === "FORBIDDEN"
            ? 403
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
