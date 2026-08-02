"use client";

import { ReactNode, useState } from "react";
import { usePathname } from "next/navigation";
import { OwnerSidebar } from "@/components/layout/owner-sidebar";
import { OwnerTopBar } from "@/components/layout/owner-top-bar";
import { OwnerBottomNav } from "@/components/layout/bottom-nav";
import { RightPanel, RightPanelProvider } from "@/components/layout/right-panel";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { breadcrumbsForPath } from "@/lib/navigation/owner-nav";
import { useOwnerHotkeys } from "@/lib/hooks/use-owner-hotkeys";

/**
 * Desktop = sidebar + dense workspace.
 * Mobile = bottom nav + slide-over drawer for full nav tree.
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

  return (
    <RightPanelProvider>
      <div className="min-h-screen bg-page">
        <OwnerSidebar
          role={role}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />

        <div className="flex min-h-screen flex-col lg:pl-[260px]">
          <OwnerTopBar
            userName={userName}
            role={role}
            onMenu={() => setDrawerOpen(true)}
          />

          <div className="flex flex-1 overflow-hidden">
            <main className="flex-1 overflow-y-auto px-4 py-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8 lg:py-6 lg:pb-6">
              <div className="hidden lg:block">
                <Breadcrumbs items={crumbs} />
              </div>
              {children}
            </main>
            <RightPanel />
          </div>
        </div>

        <OwnerBottomNav />
      </div>
    </RightPanelProvider>
  );
}
