import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { authConfig } from "@/lib/auth.config";
import { logActivity } from "@/lib/services/activity-log.service";

declare module "next-auth" {
  interface User {
    role: Role;
    companyId: string;
    storeId?: string | null;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: Role;
      companyId: string;
      storeId?: string | null;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
    companyId: string;
    storeId?: string | null;
  }
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** Progressive lockout after consecutive failures: 30s → 1m → 5m → 15m. */
function lockDurationMs(failCount: number): number | null {
  if (failCount < 3) return null;
  if (failCount < 6) return 30_000;
  if (failCount < 9) return 60_000;
  if (failCount < 12) return 5 * 60_000;
  return 15 * 60_000;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "email", type: "email" },
        password: { label: "password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase();
        const ip = null;
        const userAgent = null;

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || !user.isActive) {
          await logActivity({
            companyId: user?.companyId ?? null,
            userId: user?.id ?? null,
            action: "LOGIN_FAIL",
            entityType: "User",
            entityId: user?.id ?? null,
            comment: "unknown_or_inactive",
            result: "FAIL",
            ip,
            userAgent,
            metadata: { email },
          });
          return null;
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
          await logActivity({
            companyId: user.companyId,
            userId: user.id,
            action: "LOGIN_LOCKED",
            entityType: "User",
            entityId: user.id,
            comment: `locked_until:${user.lockedUntil.toISOString()}`,
            result: "FAIL",
            ip,
            userAgent,
            metadata: {
              email,
              failedLoginCount: user.failedLoginCount,
              lockedUntil: user.lockedUntil.toISOString(),
            },
          });
          return null;
        }

        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) {
          const failCount = user.failedLoginCount + 1;
          const lockMs = lockDurationMs(failCount);
          const lockedUntil = lockMs
            ? new Date(Date.now() + lockMs)
            : null;

          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginCount: failCount,
              lockedUntil,
            },
          });

          await logActivity({
            companyId: user.companyId,
            userId: user.id,
            action: "LOGIN_FAIL",
            entityType: "User",
            entityId: user.id,
            comment: lockMs ? `lock:${lockMs}ms` : "bad_password",
            result: "FAIL",
            ip,
            userAgent,
            metadata: {
              email,
              failedLoginCount: failCount,
              lockedUntil: lockedUntil?.toISOString() ?? null,
            },
          });
          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: {
            lastLoginAt: new Date(),
            failedLoginCount: 0,
            lockedUntil: null,
          },
        });

        await logActivity({
          companyId: user.companyId,
          userId: user.id,
          action: "LOGIN",
          entityType: "User",
          entityId: user.id,
          result: "SUCCESS",
          ip,
          userAgent,
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          companyId: user.companyId,
          storeId: user.storeId,
        };
      },
    }),
  ],
});
