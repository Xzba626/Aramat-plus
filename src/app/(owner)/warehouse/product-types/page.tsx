import { redirect } from "next/navigation";

/** Product types replaced by Categories + sales method (Part 4). */
export default function ProductTypesPage() {
  redirect("/warehouse/categories");
}
