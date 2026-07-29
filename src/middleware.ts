import { auth } from "@/lib/auth";
import { homePathForRole } from "@/lib/rbac";
import { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const publicPaths = ["/login"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;
  const role = req.auth?.user?.role as Role | undefined;

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
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const login = new URL("/login", req.url);
    // Relative path only — absolute localhost breaks phone / LAN clients
    login.searchParams.set("callbackUrl", pathname.startsWith("/") ? pathname : "/");
    return NextResponse.redirect(login);
  }

  // Seller only POS
  if (role === Role.SELLER) {
    if (
      pathname.startsWith("/dashboard") ||
      pathname.startsWith("/warehouse") ||
      pathname.startsWith("/stores") ||
      pathname.startsWith("/transfers") ||
      pathname.startsWith("/settings")
    ) {
      return NextResponse.redirect(new URL("/pos", req.url));
    }
  }

  // Owner/Manager blocked from nothing in owner area; sellers can't hit owner APIs — enforced in routes
  if (
    (role === Role.OWNER || role === Role.MANAGER) &&
    pathname.startsWith("/pos")
  ) {
    // Allowed to view stub if needed — redirect to dashboard instead
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL(homePathForRole(role!), req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
