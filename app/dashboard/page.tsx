import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/DashboardClient";
import { getInitialAssessmentDataset } from "@/lib/supabase/assessmentData";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const dataset = await getInitialAssessmentDataset();

  return (
    <DashboardClient
      initialRecords={dataset.records}
      defaultDatasetName={dataset.datasetName}
      initialImportedAt={dataset.importedAt}
      view="coach"
    />
  );
}
