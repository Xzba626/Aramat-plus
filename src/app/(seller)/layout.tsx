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
import { PosInventoryLockBanner } from "@/components/pos/pos-inventory-lock-banner";

const getStoreMeta = cache(async (storeId: string) => {
  const store = await prisma.store.findFirst({
    where: { id: storeId },
    select: { name: true, status: true },
  });
  return store;
});

export default async function SellerLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== Role.SELLER) redirect("/dashboard");

  const storeId = user.storeId;
  const [store, companyName] = await Promise.all([
    storeId ? getStoreMeta(storeId) : Promise.resolve(null),
    getCompanyBrandName(user.companyId),
  ]);
  const inventoryLocked = store?.status === "INVENTORY";

  return (
    <div className="min-h-screen bg-page">
      <PosCartSessionBinder sellerId={user.id} storeId={storeId} />
      {!inventoryLocked ? <PosCartReserveSync /> : null}
      <PosNeighbourPrefetch />
      <div className="mx-auto flex min-h-screen max-w-[480px] flex-col">
        <PosTopBar storeName={store?.name ?? undefined} companyName={companyName} />
        {inventoryLocked ? <PosInventoryLockBanner /> : null}
        <main className="flex-1 px-4 py-4 pb-24">
          {inventoryLocked ? null : children}
        </main>
        <SellerBottomNavLive />
      </div>
    </div>
  );
}
