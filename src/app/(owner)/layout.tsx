import { redirect } from "next/navigation";
import { ReactNode } from "react";
import { OwnerShell } from "@/components/layout/owner-shell";
import { Role } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { resolveCompanyName } from "@/lib/company-brand";

export default async function OwnerLayout({ children }: { children: ReactNode }) {
  // DB-backed session — JWT alone is stale after wipe/reseed (API 401 + empty dashboards).
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role === Role.SELLER) redirect("/pos");

  const company = await prisma.company.findUnique({
    where: { id: user.companyId },
    select: { name: true },
  });

  return (
    <OwnerShell
      userName={user.name}
      role={user.role}
      companyName={resolveCompanyName(company?.name)}
    >
      {children}
    </OwnerShell>
  );
}
