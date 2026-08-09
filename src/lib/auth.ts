import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { headers as nextHeaders } from "next/headers";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { authConfig } from "@/lib/auth.config";
import { logActivity } from "@/lib/services/activity-log.service";
import {
  deviceMetaForLog,
  parseUserAgent,
} from "@/lib/security/client-fingerprint";
import {
  locationMetaForLog,
  resolveClientLocation,
} from "@/lib/security/client-location";
import { notifyIfNewLogin } from "@/lib/services/security-notify.service";
import {
  accountLockDurationMs,
  clearIpLoginFailures,
  isIpLoginBlocked,
  recordIpLoginFailure,
} from "@/lib/security/login-rate-limit";

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
  /** Client-supplied UA backup when Next headers() is empty in authorize(). */
  userAgent: z.string().max(800).optional(),
});

const STORE_REFRESH_MS = 15_000;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        const u = user as {
          id?: string;
          role?: string;
          companyId?: string;
          storeId?: string | null;
        };
        token.id = u.id ?? token.sub ?? "";
        token.role = u.role as typeof token.role;
        token.companyId = u.companyId as string;
        token.storeId = u.storeId;
        (token as { storeRefreshedAt?: number }).storeRefreshedAt = Date.now();
        return token;
      }

      // Refresh store binding / role without forcing re-login (seller assignment bug).
      const userId = String(token.id ?? token.sub ?? "");
      const last =
        (token as { storeRefreshedAt?: number }).storeRefreshedAt ?? 0;
      if (userId && Date.now() - last >= STORE_REFRESH_MS) {
        const dbUser = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            storeId: true,
            role: true,
            companyId: true,
            isActive: true,
            name: true,
          },
        });
        (token as { storeRefreshedAt?: number }).storeRefreshedAt = Date.now();
        if (!dbUser || !dbUser.isActive) {
          // Invalidate JWT after wipe/reseed — layouts + APIs must not trust ghost ids.
          return { ...token, id: "", sub: "", error: "SessionUserMissing" };
        }
        token.storeId = dbUser.storeId;
        token.role = dbUser.role;
        token.companyId = dbUser.companyId;
        if (dbUser.name) token.name = dbUser.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id ?? "");
        session.user.role = token.role as typeof session.user.role;
        session.user.companyId = token.companyId as string;
        session.user.storeId =
          (token.storeId as string | null | undefined) ?? null;
      }
      return session;
    },
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "email", type: "email" },
        password: { label: "password", type: "password" },
      },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase();

        // Prefer Next.js request headers (reliable for Credentials signIn).
        // Fall back to Auth.js request object when available.
        let hdrs: Headers | null = null;
        try {
          hdrs = await nextHeaders();
        } catch {
          hdrs = null;
        }
        if (
          !hdrs &&
          request &&
          typeof (request as Request).headers?.get === "function"
        ) {
          hdrs = (request as Request).headers;
        }

        const location = hdrs ? resolveClientLocation(hdrs) : null;
        const ip = location?.ip ?? null;
        const userAgent =
          hdrs?.get("user-agent")?.trim() ||
          parsed.data.userAgent?.trim() ||
          null;
        const deviceInfo = parseUserAgent(userAgent);
        const deviceMeta = deviceMetaForLog(deviceInfo);
        const locationMeta = location ? locationMetaForLog(location) : {};

        if (isIpLoginBlocked(ip)) {
          await logActivity({
            companyId: null,
            userId: null,
            action: "LOGIN_LOCKED",
            entityType: "User",
            entityId: null,
            comment: "ip_rate_limited",
            result: "FAIL",
            ip,
            userAgent,
            metadata: { email, ...deviceMeta, ...locationMeta },
          });
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || !user.isActive) {
          // Constant-time-ish: still run bcrypt so missing users aren't faster
          // Valid bcrypt of a constant (not a real user password) — equalizes timing
          await bcrypt.compare(
            parsed.data.password,
            "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"
          );
          recordIpLoginFailure(ip);
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
            metadata: {
              email,
              ...(user?.name ? { userName: user.name } : {}),
              ...(user?.role ? { role: user.role } : {}),
              ...deviceMeta,
              ...locationMeta,
            },
          });
          return null;
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
          recordIpLoginFailure(ip);
          await logActivity({
            companyId: user.companyId,
            userId: user.id,
            action: "LOGIN_LOCKED",
            entityType: "User",
            entityId: user.id,
            comment: "account_locked",
            result: "FAIL",
            ip,
            userAgent,
            metadata: {
              email,
              userName: user.name,
              role: user.role,
              failedLoginCount: user.failedLoginCount,
              lockedUntil: user.lockedUntil.toISOString(),
              ...deviceMeta,
              ...locationMeta,
            },
          });
          return null;
        }

        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) {
          recordIpLoginFailure(ip);
          const failCount = user.failedLoginCount + 1;
          const lockMs = accountLockDurationMs(failCount);
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
            comment: lockMs ? "account_locked" : "bad_password",
            result: "FAIL",
            ip,
            userAgent,
            metadata: {
              email,
              userName: user.name,
              role: user.role,
              failedLoginCount: failCount,
              lockedUntil: lockedUntil?.toISOString() ?? null,
              ...deviceMeta,
              ...locationMeta,
            },
          });

          if (lockMs) {
            const { notifyOwnersOfSuspiciousLogin } = await import(
              "@/lib/services/security-notify.service"
            );
            void notifyOwnersOfSuspiciousLogin({
              companyId: user.companyId,
              email,
              failCount,
              ip,
              userAgent,
            }).catch(() => undefined);
          }
          return null;
        }

        clearIpLoginFailures(ip);
        await prisma.user.update({
          where: { id: user.id },
          data: {
            lastLoginAt: new Date(),
            failedLoginCount: 0,
            lockedUntil: null,
          },
        });

        const loginLog = await logActivity({
          companyId: user.companyId,
          userId: user.id,
          action: "LOGIN",
          entityType: "User",
          entityId: user.id,
          result: "SUCCESS",
          ip,
          userAgent,
          metadata: {
            userName: user.name,
            role: user.role,
            email: user.email,
            ...deviceMeta,
            ...locationMeta,
          },
        });

        // Fire-and-forget — login must not fail if notify throws
        void notifyIfNewLogin({
          userId: user.id,
          ip,
          userAgent,
          excludeLogId: loginLog.id,
        }).catch(() => undefined);

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
