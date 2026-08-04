import { redirect } from "next/navigation";

/** Reservations live under History → «Резервы». */
export default function SellerReservationsRedirectPage() {
  redirect("/pos/history?tab=reservations");
}
