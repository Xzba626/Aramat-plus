import { redirect } from "next/navigation";
import { ReactNode } from "react";
import { OwnerShell } from "@/components/layout/owner-shell";
import { Role } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import { getCompanyBrandName } from "@/lib/company-cache";

export default async function OwnerLayout({ children }: { children: ReactNode }) {
  // DB-backed session — JWT alone is stale after wipe/reseed (API 401 + empty dashboards).
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role === Role.SELLER) redirect("/pos");

  const companyName = await getCompanyBrandName(user.companyId);

  return (
    <OwnerShell userName={user.name} role={user.role} companyName={companyName}>
      {children}
    </OwnerShell>
  );
}
