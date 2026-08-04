"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Role } from "@prisma/client";
import { filterNavForRole } from "@/lib/navigation/owner-nav";

/**
 * Warm Next.js route cache for primary Owner/Manager destinations.
 * Complements default Link prefetch for off-screen / nested items.
 */
export function OwnerNavPrefetch({ role }: { role: string }) {
  const router = useRouter();

  useEffect(() => {
    const hrefs = new Set<string>();
    for (const section of filterNavForRole(role as Role)) {
      hrefs.add(section.href.split("?")[0]!);
      for (const child of section.children ?? []) {
        hrefs.add(child.href.split("?")[0]!);
      }
    }
    for (const href of hrefs) {
      try {
        router.prefetch(href);
      } catch {
        /* ignore */
      }
    }
  }, [role, router]);

  return null;
}
