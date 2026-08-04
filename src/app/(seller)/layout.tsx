import { redirect } from "next/navigation";
import { ReactNode, cache } from "react";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { getCompanyBrandName } from "@/lib/company-cache";
import { SellerBottomNavLive } from "@/components/pos/seller-bottom-nav-live";
import { PosTopBar } from "@/components/pos/pos-top-bar";
import { PosCartSessionBinder } from "@/components/pos/pos-cart-session-binder";
import { PosCartReserveSync } from "@/components/pos/pos-cart-reserve-sync";
import { PosNeighbourPrefetch } from "@/components/pwa/pos-neighbour-prefetch";

const getStoreName = cache(async (storeId: string) => {
  const store = await prisma.store.findFirst({
    where: { id: storeId },
    select: { name: true },
  });
  return store?.name ?? null;
});

export default async function SellerLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== Role.SELLER) redirect("/dashboard");

  const storeId = user.storeId;
  const [storeName, companyName] = await Promise.all([
    storeId ? getStoreName(storeId) : Promise.resolve(null),
    getCompanyBrandName(user.companyId),
  ]);

  return (
    <div className="min-h-screen bg-page">
      <PosCartSessionBinder sellerId={user.id} storeId={storeId} />
      <PosCartReserveSync />
      <PosNeighbourPrefetch />
      <div className="mx-auto flex min-h-screen max-w-[480px] flex-col">
        <PosTopBar storeName={storeName ?? undefined} companyName={companyName} />
        <main className="flex-1 px-4 py-4 pb-24">{children}</main>
        <SellerBottomNavLive />
      </div>
    </div>
  );
}
