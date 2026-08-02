import { redirect } from "next/navigation";

/** Batches list unified under «Поступления». */
export default function BatchesRedirectPage() {
  redirect("/warehouse/purchases");
}
