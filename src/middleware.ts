import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig, homePathForRole } from "@/lib/auth.config";

/**
 * Edge middleware — only edge-safe auth.config (no Prisma / bcrypt).
 * Full auth lives in src/lib/auth.ts for API / RSC.
 */
const { auth } = NextAuth(authConfig);

const publicPaths = ["/login", "/offline"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Product images — public (no auth); served by App Router from UPLOAD_DIR
  if (pathname.startsWith("/uploads/")) {
    return NextResponse.next();
  }

  // PWA assets must bypass auth
  if (
    pathname === "/sw.js" ||
    pathname === "/manifest.webmanifest" ||
    pathname.startsWith("/icons/")
  ) {
    return NextResponse.next();
  }

  const isLoggedIn = !!req.auth;
  const role = req.auth?.user?.role as string | undefined;

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Same-origin check for cookie-authenticated mutations (CSRF mitigation)
  if (
    pathname.startsWith("/api/") &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(req.method)
  ) {
    const origin = req.headers.get("origin");
    const host = req.headers.get("host");
    if (origin && host) {
      try {
        if (new URL(origin).host !== host) {
          return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
        }
      } catch {
        return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
      }
    }
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
    const ownerOnlyPrefixes = [
      "/dashboard",
      "/warehouse",
      "/stores",
      "/transfers",
      "/settings",
      "/analytics",
      "/users",
      "/revision",
      "/returns",
      "/journal",
      "/notifications",
      "/reservations",
      "/more",
      "/attention",
      "/sales",
      "/sellers",
      "/reports",
      "/history",
      "/export",
      "/discounts",
    ];
    if (ownerOnlyPrefixes.some((p) => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL("/pos", req.url));
    }
  }

  if (role === "MANAGER") {
    const managerBlockedPrefixes = [
      "/users",
      "/journal",
      "/settings/wipe",
      "/settings/system",
      "/settings/references",
      "/warehouse/write-offs",
    ];
    if (managerBlockedPrefixes.some((p) => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  // OWNER + ADMIN + MANAGER use owner area; POS is seller-only.
  if (
    (role === "OWNER" || role === "ADMIN" || role === "MANAGER") &&
    pathname.startsWith("/pos")
  ) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // ADMIN cannot wipe (OWNER-only UI path)
  if (role === "ADMIN" && pathname.startsWith("/settings/wipe")) {
    return NextResponse.redirect(new URL("/settings", req.url));
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
