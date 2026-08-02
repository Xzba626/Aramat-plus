"use client";

import { ReactNode, useState } from "react";
import { usePathname } from "next/navigation";
import { OwnerSidebar } from "@/components/layout/owner-sidebar";
import { OwnerTopBar } from "@/components/layout/owner-top-bar";
import { RightPanel, RightPanelProvider } from "@/components/layout/right-panel";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { breadcrumbsForPath } from "@/lib/navigation/owner-nav";
import { useOwnerHotkeys } from "@/lib/hooks/use-owner-hotkeys";

/**
 * One shell for all viewports: same sidebar tree + workspace.
 * Mobile-only difference: hamburger toggles the left sidebar drawer.
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
  const [drawerOpen, setDrawerOpen] = useState(false);

  function openDrawer() {
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  return (
    <RightPanelProvider>
      <div className="min-h-screen bg-page">
        <OwnerSidebar
          role={role}
          open={drawerOpen}
          onClose={closeDrawer}
        />

        <div className="flex min-h-screen flex-col lg:pl-[260px]">
          <OwnerTopBar
            userName={userName}
            role={role}
            onMenu={openDrawer}
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
