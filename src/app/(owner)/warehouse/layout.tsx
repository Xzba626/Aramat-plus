import { ReactNode } from "react";

/** Warehouse sub-routes live in the grouped sidebar — no second nav strip. */
export default function WarehouseLayout({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}
