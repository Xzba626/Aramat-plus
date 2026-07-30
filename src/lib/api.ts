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
    return jsonError(err.issues.map((i) => i.message).join("; "), 400);
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
      "BRAND_NAME_REQUIRED",
      "BRAND_NOT_FOUND",
      "COST_REQUIRED_FOR_STOCK",
      "FORBIDDEN",
      "ID_REQUIRED",
      "NOT_FOUND",
      "PRODUCT_NOT_FOUND",
      "RETURN_ALREADY_PENDING",
      "SELLER_NO_STORE",
      "STORE_NOT_FOUND",
      "UNAUTHORIZED",
      "USER_NOT_FOUND",
      "VALIDATION_ERROR",
      "WAREHOUSE_MISSING",
      "WRONG_PASSWORD",
    ]);
    if (safeCodes.has(err.message)) {
      const status =
        err.message === "UNAUTHORIZED"
          ? 401
          : err.message === "FORBIDDEN"
            ? 403
            : err.message === "NOT_FOUND"
              ? 404
              : 400;
      return jsonError(err.message, status);
    }
    // Don't forward Prisma-looking messages
    if (/prisma|invocation|column|relation/i.test(err.message)) {
      return jsonError("DB_ERROR", 500);
    }
    return jsonError(err.message, 400);
  }

  console.error("[api] Unknown error", err);
  return jsonError("INTERNAL_ERROR", 500);
}
