import {
  applyAssessmentLogic,
  compareAssessmentQuarters,
  getAvailableQuarters,
  getQuarterCentre,
  getQuarterCoachName,
  getQuarterLevel,
  getQuarterResult,
  getQuarterSession,
  normalizeAssessmentQuarter,
  normalizeAssessmentResult,
  recordHasQuarter
} from "../assessmentLogic.ts";
import type {
  AssessmentQuarter,
  QuarterAssessmentDetails,
  StudentAssessmentRecord
} from "../../types/assessment.ts";

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

export function assessmentImportRowsToRecords(rows: AssessmentImportRow[]) {
  const grouped = new Map<
    string,
    Partial<StudentAssessmentRecord> & {
      quarterDetails: Partial<Record<AssessmentQuarter, QuarterAssessmentDetails>>;
      studentName: string;
    }
  >();

  for (const row of rows) {
    const quarter = normalizeAssessmentQuarter(row.quarter);

    if (!quarter || !row.student_name) {
      continue;
    }

    const year = String(row.year || new Date().getFullYear());
    const studentKey = row.student_code?.trim() || row.student_name.trim().toLowerCase();
    const key = `${year}-${studentKey}`;
    const existing =
      grouped.get(key) ??
      ({
        assessmentYear: year,
        id: slugId(year, studentKey),
        q1Result: "",
        q2Result: "",
        quarterDetails: {},
        studentCode: row.student_code?.trim() || undefined,
        studentName: row.student_name.trim()
      } satisfies Partial<StudentAssessmentRecord> & {
        quarterDetails: Partial<Record<AssessmentQuarter, QuarterAssessmentDetails>>;
        studentName: string;
      });

    existing.quarterDetails[quarter] = {
      coachName: row.coach_name?.trim() || undefined,
      centre: row.centre_name?.trim() || undefined,
      level: row.level?.trim() || undefined,
      session: row.session_label?.trim() || undefined,
      result: normalizeAssessmentResult(row.result)
    };

    if (quarter === "Q1") {
      existing.q1CoachName = existing.quarterDetails[quarter]?.coachName;
      existing.q1Centre = existing.quarterDetails[quarter]?.centre;
      existing.q1Level = existing.quarterDetails[quarter]?.level;
      existing.q1Session = existing.quarterDetails[quarter]?.session;
      existing.q1Result = existing.quarterDetails[quarter]?.result ?? "";
    }

    if (quarter === "Q2") {
      existing.q2CoachName = existing.quarterDetails[quarter]?.coachName;
      existing.q2Centre = existing.quarterDetails[quarter]?.centre;
      existing.q2Level = existing.quarterDetails[quarter]?.level;
      existing.q2Session = existing.quarterDetails[quarter]?.session;
      existing.q2Result = existing.quarterDetails[quarter]?.result ?? "";
    }

    const latestDetail = getLatestDetail(existing.quarterDetails);
    existing.coachName = latestDetail?.coachName || existing.coachName || "Unassigned";
    existing.centre = latestDetail?.centre || existing.centre;
    existing.level = latestDetail?.level || existing.level;
    existing.session = latestDetail?.session || existing.session;
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
      q1CoachName: record.q1CoachName,
      q1Centre: record.q1Centre,
      q1Level: record.q1Level,
      q1Session: record.q1Session,
      q1Result: record.q1Result ?? "",
      q2CoachName: record.q2CoachName,
      q2Centre: record.q2Centre,
      q2Level: record.q2Level,
      q2Session: record.q2Session,
      q2Result: record.q2Result ?? "",
      quarterDetails: record.quarterDetails
    })
  );
}

export function recordsToAssessmentImportRows(records: StudentAssessmentRecord[]) {
  return records.flatMap((record) =>
    getAvailableQuarters([record])
      .filter((quarter) => recordHasQuarter(record, quarter))
      .map((quarter) => ({
        student_code: record.studentCode || record.id,
        student_name: record.studentName,
        year: Number(record.assessmentYear ?? "2026"),
        quarter,
        coach_name: getQuarterCoachName(record, quarter),
        centre_name: getQuarterCentre(record, quarter) || null,
        level: getQuarterLevel(record, quarter) || null,
        session_label: getQuarterSession(record, quarter) || null,
        result: getQuarterResult(record, quarter) || null,
        notes: record.originalActionRequired ?? null
      }))
  );
}

function getLatestDetail(
  quarterDetails: Partial<Record<AssessmentQuarter, QuarterAssessmentDetails>>
) {
  const quarters = (Object.keys(quarterDetails) as AssessmentQuarter[])
    .slice()
    .sort(compareAssessmentQuarters);

  for (let index = quarters.length - 1; index >= 0; index -= 1) {
    const detail = quarterDetails[quarters[index]];

    if (detail) {
      return detail;
    }
  }

  return undefined;
}

function slugId(year: string, value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `${year}-${slug || "student"}`;
}

export type { AssessmentImportRow };
