import { redirect } from "next/navigation";
import { SchedulingClient } from "@/components/SchedulingClient";
import { canAccessScheduling, canManageScheduling } from "@/lib/staffRoles";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const { profile } = await requireActiveStaffSession();

  if (!canAccessScheduling(profile)) {
    redirect("/dashboard");
  }

  return (
    <SchedulingClient
      canManageSchedule={canManageScheduling(profile)}
      staffProfile={profile}
    />
  );
}
