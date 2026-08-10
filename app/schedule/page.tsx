import { redirect } from "next/navigation";
import { SchedulingClient } from "@/components/SchedulingClient";
import { getWeekStartDate } from "@/lib/scheduling";
import { canManageScheduling } from "@/lib/staffRoles";
import { getSchedulingDashboardData } from "@/lib/supabase/scheduling";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";

export const dynamic = "force-dynamic";

export default async function SchedulePage({
  searchParams
}: {
  searchParams?: {
    error?: string;
    saved?: string;
    week?: string;
  };
}) {
  const { profile } = await requireActiveStaffSession();

  if (!canManageScheduling(profile)) {
    redirect("/dashboard");
  }

  const weekStartDate = getWeekStartDate(searchParams?.week);
  const data = await getSchedulingDashboardData(weekStartDate);

  return (
    <SchedulingClient
      data={data}
      flash={searchParams?.error ? { text: searchParams.error, tone: "error" } : searchParams?.saved ? { text: searchParams.saved, tone: "success" } : null}
      staffProfile={profile}
    />
  );
}
