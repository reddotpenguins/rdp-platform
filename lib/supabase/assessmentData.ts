import { getDefaultAssessmentRecords } from "@/lib/sampleData";
import { assessmentImportRowsToRecords, type AssessmentImportRow } from "@/lib/supabase/assessmentImport";
import { createClient } from "@/lib/supabase/server";

export type AssessmentDataset = {
  records: Awaited<ReturnType<typeof getDefaultAssessmentRecords>>;
  datasetName: string;
  importedAt?: string | null;
  source: "supabase" | "demo";
};

export async function getInitialAssessmentDataset(): Promise<AssessmentDataset> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("assessment_import_rows")
    .select(
      "id, student_code, student_name, year, quarter, coach_name, coach_email, centre_name, level, session_label, session_start, session_end, result, notes, imported_at"
    )
    .order("imported_at", { ascending: true });

  if (!error && data && data.length > 0) {
    const records = assessmentImportRowsToRecords(data as AssessmentImportRow[]);
    const latestImport = data
      .map((row) => row.imported_at)
      .filter(Boolean)
      .sort()
      .at(-1);

    return {
      records,
      datasetName: "Supabase assessment import rows",
      importedAt: latestImport,
      source: "supabase"
    };
  }

  const records = await getDefaultAssessmentRecords();

  return {
    records,
    datasetName: "Demo assessment data",
    importedAt: null,
    source: "demo"
  };
}
