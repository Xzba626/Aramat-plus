import { redirect } from "next/navigation";
import { ReactNode } from "react";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { SellerBottomNavLive } from "@/components/pos/seller-bottom-nav-live";
import { PosTopBar } from "@/components/pos/pos-top-bar";
import { PosCartSessionBinder } from "@/components/pos/pos-cart-session-binder";

export default async function SellerLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== Role.SELLER) redirect("/dashboard");

  const storeId = user.storeId;
  const store = storeId
    ? await prisma.store.findFirst({
        where: { id: storeId },
        select: { name: true },
      })
    : null;

  return (
    <div className="min-h-screen bg-page">
      <PosCartSessionBinder sellerId={user.id} storeId={storeId} />
      <div className="mx-auto flex min-h-screen max-w-[480px] flex-col">
        <PosTopBar storeName={store?.name} />
        <main className="flex-1 px-4 py-4 pb-24">{children}</main>
        <SellerBottomNavLive />
      </div>
    </div>
  );
}
