import { redirect } from "next/navigation";
import { TrainingResourcesClient } from "@/components/TrainingResourcesClient";
import {
  canManageTrainingResources,
  canViewTrainingResources
} from "@/lib/staffRoles";
import { getTrainingResources } from "@/lib/supabase/trainingResources";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";

export const dynamic = "force-dynamic";

type TrainingResourcesPageProps = {
  searchParams?: {
    error?: string;
    message?: string;
  };
};

export default async function TrainingResourcesPage({ searchParams }: TrainingResourcesPageProps) {
  const { profile } = await requireActiveStaffSession();

  if (!canViewTrainingResources(profile)) {
    redirect("/dashboard");
  }

  const canManage = canManageTrainingResources(profile);
  const result = await getTrainingResources(canManage);

  return (
    <TrainingResourcesClient
      canManage={canManage}
      dataError={result.error}
      flash={
        searchParams?.error
          ? { text: searchParams.error, tone: "error" }
          : searchParams?.message
            ? { text: searchParams.message, tone: "success" }
            : null
      }
      resources={result.resources}
      staffProfile={profile}
    />
  );
}
