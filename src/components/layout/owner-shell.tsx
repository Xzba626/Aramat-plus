"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { OwnerSidebar } from "@/components/layout/owner-sidebar";
import { OwnerTopBar } from "@/components/layout/owner-top-bar";
import { RightPanel, RightPanelProvider } from "@/components/layout/right-panel";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { breadcrumbsForPath } from "@/lib/navigation/owner-nav";
import { useOwnerHotkeys } from "@/lib/hooks/use-owner-hotkeys";
import { cn } from "@/lib/utils";

const DESKTOP_MIN = 1024;

/**
 * One shell for all viewports: same sidebar tree + workspace.
 * Hamburger toggles sidebar on every width (Menu ↔ ✕).
 */
export function OwnerShell({
  children,
  userName,
  role,
}: {
  children: ReactNode;
  userName: string;
  role: string;
}) {
  const pathname = usePathname();
  const crumbs = breadcrumbsForPath(pathname);
  useOwnerHotkeys();
  const [navOpen, setNavOpen] = useState(true);

  useEffect(() => {
    setNavOpen(window.innerWidth >= DESKTOP_MIN);
  }, []);

  function toggleNav() {
    setNavOpen((v) => !v);
  }

  function closeNav() {
    setNavOpen(false);
  }

  /** Link click closes drawer on mobile only — keep desktop sidebar open while navigating. */
  function onNavNavigate() {
    if (typeof window !== "undefined" && window.innerWidth >= DESKTOP_MIN) return;
    setNavOpen(false);
  }

  return (
    <RightPanelProvider>
      <div className="min-h-screen bg-page">
        <OwnerSidebar
          role={role}
          open={navOpen}
          onClose={closeNav}
          onNavigate={onNavNavigate}
        />

        <div
          className={cn(
            "flex min-h-screen flex-col transition-[padding] duration-200",
            navOpen && "lg:pl-[260px]"
          )}
        >
          <OwnerTopBar
            userName={userName}
            role={role}
            menuOpen={navOpen}
            onMenu={toggleNav}
          />

          <div className="flex flex-1 overflow-hidden">
            <main className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
              <Breadcrumbs items={crumbs} />
              {children}
            </main>
            <RightPanel />
          </div>
        </div>
      </div>
    </RightPanelProvider>
  );
}
