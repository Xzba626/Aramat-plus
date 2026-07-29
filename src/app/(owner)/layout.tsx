import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ReactNode } from "react";
import { OwnerShell } from "@/components/layout/owner-shell";
import { Role } from "@prisma/client";

export default async function OwnerLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role === Role.SELLER) redirect("/pos");

  return (
    <OwnerShell userName={session.user.name} role={session.user.role}>
      {children}
    </OwnerShell>
  );
}
