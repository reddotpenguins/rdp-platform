import { DashboardClient } from "@/components/DashboardClient";
import { defaultDatasetName, getDefaultAssessmentRecords } from "@/lib/sampleData";

export default async function DashboardPage() {
  const records = await getDefaultAssessmentRecords();

  return (
    <DashboardClient
      initialRecords={records}
      defaultDatasetName={defaultDatasetName}
      view="coach"
    />
  );
}
