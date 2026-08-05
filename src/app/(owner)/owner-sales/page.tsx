import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { StoreKind } from "@prisma/client";

/**
 * Fast entry for owner-direct POS — same screen as Magazines → card → sales.
 * No separate sales module; resolves the OWNER_DIRECT store id and redirects.
 */
export default async function OwnerSalesShortcutPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const store = await prisma.store.findFirst({
    where: {
      companyId: session.user.companyId,
      kind: StoreKind.OWNER_DIRECT,
      isArchived: false,
    },
    select: { id: true },
  });

  if (!store) redirect("/stores");
  redirect(`/stores/${store.id}/pos`);
}
