import { redirect } from "next/navigation";
import { canViewAdminHome } from "@/lib/staffRoles";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";

export const dynamic = "force-dynamic";

export default async function HomeRouterPage() {
  const { profile } = await requireActiveStaffSession();

  if (canViewAdminHome(profile)) {
    redirect("/admin");
  }

  redirect("/dashboard");
}
