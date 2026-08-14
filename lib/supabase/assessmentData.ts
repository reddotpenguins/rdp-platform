import { getDefaultAssessmentRecords } from "@/lib/sampleData";
import { assessmentImportRowsToRecords, type AssessmentImportRow } from "@/lib/supabase/assessmentImport";
import { createClient } from "@/lib/supabase/server";
import {
  canViewAllAssessments,
  canViewTeamAssessments,
  hasStaffPermission,
  type StaffProfile
} from "@/lib/staffRoles";

const assessmentImportColumns =
  "id, student_code, student_name, year, quarter, coach_name, coach_email, centre_name, level, session_label, session_start, session_end, result, notes, imported_at";
const pageSize = 1000;

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
  const { data, error } = await fetchAssessmentImportRows(supabase);

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

async function fetchAssessmentImportRows(supabase: ReturnType<typeof createClient>) {
  const rows: AssessmentImportRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("assessment_import_rows")
      .select(assessmentImportColumns)
      .order("imported_at", { ascending: true })
      .order("student_name", { ascending: true })
      .order("quarter", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      return { data: null, error };
    }

    rows.push(...((data ?? []) as AssessmentImportRow[]));

    if (!data || data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return { data: rows, error: null };
}

function filterRowsForStaffProfile(rows: AssessmentImportRow[], staffProfile?: StaffProfile) {
  if (!staffProfile || canViewAllAssessments(staffProfile)) {
    return rows;
  }

  if (canViewTeamAssessments(staffProfile)) {
    const assignedCentres = staffProfile.assignedCentres.map((centreName) =>
      centreName.trim().toLowerCase()
    );

    return rows.filter((row) =>
      assignedCentres.includes(row.centre_name?.trim().toLowerCase() ?? "")
    );
  }

  if (!hasStaffPermission(staffProfile, "assessments.viewOwn")) {
    return [];
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
