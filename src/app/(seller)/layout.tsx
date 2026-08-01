import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ReactNode } from "react";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SellerBottomNavLive } from "@/components/pos/seller-bottom-nav-live";
import { PosTopBar } from "@/components/pos/pos-top-bar";
import { PosCartSessionBinder } from "@/components/pos/pos-cart-session-binder";

export default async function SellerLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== Role.SELLER) redirect("/dashboard");

  // Always read store binding from DB — JWT can lag after Owner assigns a store.
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { storeId: true, isActive: true },
  });
  if (!dbUser?.isActive) redirect("/login");

  const storeId = dbUser.storeId;
  const store = storeId
    ? await prisma.store.findFirst({
        where: { id: storeId },
        select: { name: true },
      })
    : null;

  return (
    <div className="min-h-screen bg-page">
      <PosCartSessionBinder sellerId={session.user.id} storeId={storeId} />
      <div className="mx-auto flex min-h-screen max-w-[480px] flex-col">
        <PosTopBar storeName={store?.name} />
        <main className="flex-1 px-4 py-4 pb-24">{children}</main>
        <SellerBottomNavLive />
      </div>
    </div>
  );
}
