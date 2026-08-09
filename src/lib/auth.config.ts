import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config (no Prisma / bcrypt).
 * Used by middleware so the Edge bundle stays under Vercel hobby limits.
 */
export const authConfig = {
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 12, // 12h
  },
  useSecureCookies: process.env.NODE_ENV === "production",
  cookies: {
    sessionToken: {
      options: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as {
          id?: string;
          role?: string;
          companyId?: string;
          storeId?: string | null;
        };
        token.id = u.id ?? token.sub ?? "";
        (token as Record<string, unknown>).role = u.role;
        (token as Record<string, unknown>).companyId = u.companyId;
        (token as Record<string, unknown>).storeId = u.storeId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id ?? "");
        (session.user as { role?: string }).role = token.role as string;
        (session.user as { companyId?: string }).companyId =
          token.companyId as string;
        (session.user as { storeId?: string | null }).storeId =
          (token.storeId as string | null | undefined) ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

export function homePathForRole(role: string | undefined): string {
  if (role === "SELLER") return "/pos";
  // M1: manager ops home — not finance dashboard
  if (role === "MANAGER") return "/stores";
  return "/dashboard";
}
