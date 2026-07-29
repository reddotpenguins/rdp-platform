import { getDefaultAssessmentRecords } from "@/lib/sampleData";
import { assessmentImportRowsToRecords, type AssessmentImportRow } from "@/lib/supabase/assessmentImport";
import { createClient } from "@/lib/supabase/server";
import type { StaffProfile } from "@/lib/staffRoles";

export type AssessmentDataset = {
  records: Awaited<ReturnType<typeof getDefaultAssessmentRecords>>;
  datasetName: string;
  importedAt?: string | null;
  source: "supabase" | "demo";
};

export async function getInitialAssessmentDataset(
  staffProfile?: StaffProfile
): Promise<AssessmentDataset> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("assessment_import_rows")
    .select(
      "id, student_code, student_name, year, quarter, coach_name, coach_email, centre_name, level, session_label, session_start, session_end, result, notes, imported_at"
    )
    .order("imported_at", { ascending: true });

  if (!error && data) {
    const visibleRows = filterRowsForStaffProfile(data as AssessmentImportRow[], staffProfile);
    const records = assessmentImportRowsToRecords(visibleRows);
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

function filterRowsForStaffProfile(rows: AssessmentImportRow[], staffProfile?: StaffProfile) {
  if (!staffProfile || staffProfile.role === "admin") {
    return rows;
  }

  if (staffProfile.role === "lead_coach") {
    const assignedCentres = staffProfile.assignedCentres.map((centreName) =>
      centreName.trim().toLowerCase()
    );

    return rows.filter((row) =>
      assignedCentres.includes(row.centre_name?.trim().toLowerCase() ?? "")
    );
  }

  const email = staffProfile.email.trim().toLowerCase();
  const coachName = staffProfile.coachName?.trim().toLowerCase();

  return rows.filter((row) => {
    const rowCoachEmail = row.coach_email?.trim().toLowerCase();
    const rowCoachName = row.coach_name?.trim().toLowerCase();

    return (
      Boolean(rowCoachEmail && rowCoachEmail === email) ||
      Boolean(!rowCoachEmail && coachName && rowCoachName === coachName)
    );
  });
}
