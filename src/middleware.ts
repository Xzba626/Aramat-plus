import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig, homePathForRole } from "@/lib/auth.config";

/**
 * Edge middleware — only edge-safe auth.config (no Prisma / bcrypt).
 * Full auth lives in src/lib/auth.ts for API / RSC.
 */
const { auth } = NextAuth(authConfig);

const publicPaths = ["/login"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const role = req.auth?.user?.role as string | undefined;

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  if (publicPaths.some((p) => pathname.startsWith(p))) {
    if (isLoggedIn && role) {
      return NextResponse.redirect(new URL(homePathForRole(role), req.url));
    }
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const login = new URL("/login", req.url);
    login.searchParams.set(
      "callbackUrl",
      pathname.startsWith("/") ? pathname : "/"
    );
    return NextResponse.redirect(login);
  }

  if (role === "SELLER") {
    if (
      pathname.startsWith("/dashboard") ||
      pathname.startsWith("/warehouse") ||
      pathname.startsWith("/stores") ||
      pathname.startsWith("/transfers") ||
      pathname.startsWith("/settings") ||
      pathname.startsWith("/analytics") ||
      pathname.startsWith("/users") ||
      pathname.startsWith("/revision") ||
      pathname.startsWith("/returns") ||
      pathname.startsWith("/journal") ||
      pathname.startsWith("/notifications")
    ) {
      return NextResponse.redirect(new URL("/pos", req.url));
    }
  }

  if ((role === "OWNER" || role === "MANAGER") && pathname.startsWith("/pos")) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL(homePathForRole(role), req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
