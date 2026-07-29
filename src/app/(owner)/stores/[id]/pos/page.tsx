import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { StoreKind } from "@prisma/client";
import { OwnerDirectPosClient } from "@/components/pos/owner-direct-pos-client";

type Props = { params: Promise<{ id: string }> };

export default async function OwnerDirectPosPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const store = await prisma.store.findFirst({
    where: { id, companyId: session.user.companyId },
  });
  if (!store) notFound();
  if (store.kind !== StoreKind.OWNER_DIRECT) {
    redirect(`/stores/${id}`);
  }

  return <OwnerDirectPosClient storeId={store.id} storeName={store.name} />;
}
