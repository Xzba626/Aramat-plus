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
    // Known safe app messages (Russian from services) — map to codes when possible
    const safeCodes = new Set([
      "WAREHOUSE_MISSING",
      "PRODUCT_NOT_FOUND",
      "BRAND_NOT_FOUND",
    ]);
    if (safeCodes.has(err.message)) {
      return jsonError(err.message, 400);
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
