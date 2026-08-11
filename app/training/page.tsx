import { redirect } from "next/navigation";
import { TrainingDashboardClient } from "@/components/TrainingDashboardClient";
import {
  canManageTrainingResources,
  canViewTrainingDepartment,
  canViewTrainingResources
} from "@/lib/staffRoles";
import { getTrainingResources } from "@/lib/supabase/trainingResources";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";

export const dynamic = "force-dynamic";

type TrainingPageProps = {
  searchParams?: {
    error?: string;
    message?: string;
    tab?: string;
  };
};

export default async function TrainingPage({ searchParams }: TrainingPageProps) {
  const { profile } = await requireActiveStaffSession();
  const canViewDepartment = canViewTrainingDepartment(profile);
  const canViewResources = canViewTrainingResources(profile);

  if (!canViewDepartment && !canViewResources) {
    redirect("/dashboard");
  }

  const canManageResources = canManageTrainingResources(profile);
  const result = await getTrainingResources(canManageResources);

  return (
    <TrainingDashboardClient
      canManageResources={canManageResources}
      canViewDepartment={canViewDepartment}
      dataError={result.error}
      flash={
        searchParams?.error
          ? { text: searchParams.error, tone: "error" }
          : searchParams?.message
            ? { text: searchParams.message, tone: "success" }
            : null
      }
      initialTab={getTrainingTab(searchParams?.tab, canViewDepartment)}
      resources={result.resources}
      staffProfile={profile}
    />
  );
}

function getTrainingTab(tab: string | undefined, canViewDepartment: boolean) {
  if (tab === "resources") return "resources";
  if (tab === "coach-development" && canViewDepartment) return "coach-development";
  if (tab === "trainees" && canViewDepartment) return "trainees";

  return canViewDepartment ? "overview" : "resources";
}
