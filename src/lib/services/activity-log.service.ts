import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { clientIpFromHeaders } from "@/lib/security/client-fingerprint";

type LogInput = {
  userId?: string | null;
  companyId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  comment?: string | null;
  metadata?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
  result?: "SUCCESS" | "FAIL" | string | null;
  tx?: Prisma.TransactionClient;
};

export function requestAuditMeta(req: Request) {
  return {
    ip: clientIpFromHeaders(req.headers),
    userAgent: req.headers.get("user-agent"),
  };
}

export async function logActivity(input: LogInput) {
  const client = input.tx ?? prisma;
  return client.activityLog.create({
    data: {
      userId: input.userId ?? null,
      companyId: input.companyId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      comment: input.comment ?? null,
      metadata: input.metadata ?? undefined,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      result: input.result ?? "SUCCESS",
    },
  });
}
