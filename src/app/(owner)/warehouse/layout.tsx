import { ReactNode } from "react";
import { WarehouseMobileTabs } from "@/components/layout/warehouse-mobile-tabs";

/** Mobile: short task tabs. Desktop: full tree lives in the sidebar. */
export default function WarehouseLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <WarehouseMobileTabs />
      {children}
    </div>
  );
}
