import { DashboardClient } from "@/components/DashboardClient";
import { canUploadAssessmentData } from "@/lib/staffRoles";
import { getInitialAssessmentDataset } from "@/lib/supabase/assessmentData";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";

export const dynamic = "force-dynamic";

export default async function QuarterDashboardPage() {
  const { profile } = await requireActiveStaffSession();
  const dataset = await getInitialAssessmentDataset(profile);

  return (
    <DashboardClient
      initialRecords={dataset.records}
      defaultDatasetName={dataset.datasetName}
      initialImportedAt={dataset.importedAt}
      staffName={profile.fullName}
      staffRole={profile.role}
      canUpload={canUploadAssessmentData(profile)}
      view="quarter"
    />
  );
}
