import { applyAssessmentLogic, normalizeAssessmentResult } from "@/lib/assessmentLogic";
import type { AssessmentQuarter, StudentAssessmentRecord } from "@/types/assessment";

type AssessmentImportRow = {
  id?: string;
  student_code?: string | null;
  student_name: string;
  year: number;
  quarter: string;
  coach_name?: string | null;
  coach_email?: string | null;
  centre_name?: string | null;
  level?: string | null;
  session_label?: string | null;
  session_start?: string | null;
  session_end?: string | null;
  result?: string | null;
  notes?: string | null;
  imported_at?: string | null;
};

const supportedQuarters: AssessmentQuarter[] = ["Q1", "Q2"];

export function assessmentImportRowsToRecords(rows: AssessmentImportRow[]) {
  const grouped = new Map<
    string,
    Partial<StudentAssessmentRecord> & { studentName: string }
  >();

  for (const row of rows) {
    const quarter = normalizeQuarter(row.quarter);

    if (!quarter || !row.student_name) {
      continue;
    }

    const year = String(row.year || new Date().getFullYear());
    const studentKey = row.student_code?.trim() || row.student_name.trim().toLowerCase();
    const key = `${year}-${studentKey}`;
    const existing =
      grouped.get(key) ??
      ({
        id: slugId(year, studentKey),
        studentCode: row.student_code?.trim() || undefined,
        studentName: row.student_name.trim(),
        assessmentYear: year,
        q1Result: "",
        q2Result: ""
      } satisfies Partial<StudentAssessmentRecord> & { studentName: string });

    if (quarter === "Q1") {
      existing.q1CoachName = row.coach_name?.trim() || existing.q1CoachName;
      existing.q1Centre = row.centre_name?.trim() || existing.q1Centre;
      existing.q1Level = row.level?.trim() || existing.q1Level;
      existing.q1Session = row.session_label?.trim() || existing.q1Session;
      existing.q1Result = normalizeAssessmentResult(row.result);
    } else {
      existing.q2CoachName = row.coach_name?.trim() || existing.q2CoachName;
      existing.q2Centre = row.centre_name?.trim() || existing.q2Centre;
      existing.q2Level = row.level?.trim() || existing.q2Level;
      existing.q2Session = row.session_label?.trim() || existing.q2Session;
      existing.q2Result = normalizeAssessmentResult(row.result);
    }

    existing.coachName = existing.q2CoachName || existing.q1CoachName || "Unassigned";
    existing.centre = existing.q2Centre || existing.q1Centre;
    existing.level = existing.q2Level || existing.q1Level;
    existing.session = existing.q2Session || existing.q1Session;
    grouped.set(key, existing);
  }

  return Array.from(grouped.values()).map((record) =>
    applyAssessmentLogic({
      id: record.id ?? slugId(record.assessmentYear ?? "2026", record.studentName),
      studentCode: record.studentCode,
      studentName: record.studentName,
      coachName: record.coachName || "Unassigned",
      centre: record.centre,
      level: record.level,
      session: record.session,
      assessmentYear: record.assessmentYear,
      q1CoachName: record.q1CoachName || record.coachName || "Unassigned",
      q1Centre: record.q1Centre || record.centre,
      q1Level: record.q1Level || record.level,
      q1Session: record.q1Session || record.session,
      q1Result: record.q1Result ?? "",
      q2CoachName: record.q2CoachName || record.coachName || "Unassigned",
      q2Centre: record.q2Centre || record.centre,
      q2Level: record.q2Level || record.level,
      q2Session: record.q2Session || record.session,
      q2Result: record.q2Result ?? ""
    })
  );
}

export function recordsToAssessmentImportRows(records: StudentAssessmentRecord[]) {
  return records.flatMap((record) =>
    supportedQuarters.map((quarter) => ({
      student_code: record.studentCode || record.id,
      student_name: record.studentName,
      year: Number(record.assessmentYear ?? "2026"),
      quarter,
      coach_name:
        quarter === "Q1"
          ? record.q1CoachName ?? record.coachName
          : record.q2CoachName ?? record.coachName,
      centre_name:
        quarter === "Q1" ? record.q1Centre ?? record.centre : record.q2Centre ?? record.centre,
      level: quarter === "Q1" ? record.q1Level ?? record.level : record.q2Level ?? record.level,
      session_label:
        quarter === "Q1" ? record.q1Session ?? record.session : record.q2Session ?? record.session,
      result: quarter === "Q1" ? record.q1Result || null : record.q2Result || null,
      notes: record.originalActionRequired ?? null
    }))
  );
}

function normalizeQuarter(value: string): AssessmentQuarter | "" {
  const cleaned = String(value ?? "").trim().toUpperCase();

  if (cleaned === "Q1" || cleaned === "1") {
    return "Q1";
  }

  if (cleaned === "Q2" || cleaned === "2") {
    return "Q2";
  }

  return "";
}

function slugId(year: string, value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `${year}-${slug || "student"}`;
}

export type { AssessmentImportRow };
