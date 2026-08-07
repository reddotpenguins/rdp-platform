import { redirect } from "next/navigation";
import { TrainingDashboardClient } from "@/components/TrainingDashboardClient";
import { canViewTrainingDepartment } from "@/lib/staffRoles";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";

export const dynamic = "force-dynamic";

export default async function TrainingPage() {
  const { profile } = await requireActiveStaffSession();

  if (!canViewTrainingDepartment(profile)) {
    redirect("/dashboard");
  }

  return <TrainingDashboardClient />;
}
