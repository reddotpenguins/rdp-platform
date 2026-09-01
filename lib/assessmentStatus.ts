import {
  compareAssessmentQuarters,
  getQuarterResult,
  getRecordQuarters
} from "@/lib/assessmentLogic";
import type {
  AssessmentQuarter,
  AssessmentResult,
  FlagStatus,
  StudentAssessmentRecord
} from "@/types/assessment";

export type StudentAssessmentStatus =
  | "Require intervention"
  | "Monitor"
  | "Ready to advance"
  | "Due for assessment"
  | "On track";

export type AssessmentOverview = {
  totalStudents: number;
  assessedStudents: number;
  passCount: number;
  failCount: number;
  passRate: number;
  failRate: number;
  statusCounts: Record<StudentAssessmentStatus, number>;
};

export const studentAssessmentStatuses: StudentAssessmentStatus[] = [
  "Ready to advance",
  "On track",
  "Monitor",
  "Require intervention",
  "Due for assessment"
];

export function displayAssessmentResult(result: AssessmentResult | "") {
  if (!result || result === "Not Assessed") {
    return "Not assessed";
  }

  return result;
}

export function isNotAssessedResult(result: AssessmentResult | "") {
  return !result || result === "Not Assessed";
}

export function resultMatchesFilter(
  result: AssessmentResult | "",
  filter: "All" | AssessmentResult
) {
  if (filter === "All") {
    return true;
  }

  if (filter === "Not Assessed") {
    return isNotAssessedResult(result);
  }

  return result === filter;
}

export function getStudentAssessmentStatus(
  record: StudentAssessmentRecord,
  selectedQuarter: "All" | AssessmentQuarter
): StudentAssessmentStatus {
  return statusFromParts(record.flagStatus, getRelevantAssessmentResult(record, selectedQuarter));
}

export function getQuarterRowAssessmentStatus({
  flagStatus,
  result
}: {
  flagStatus: FlagStatus;
  result: AssessmentResult;
}): StudentAssessmentStatus {
  return statusFromParts(flagStatus, result);
}

export function calculateAssessmentOverview(
  records: StudentAssessmentRecord[],
  selectedQuarter: "All" | AssessmentQuarter
): AssessmentOverview {
  const statusCounts = Object.fromEntries(
    studentAssessmentStatuses.map((status) => [status, 0])
  ) as Record<StudentAssessmentStatus, number>;
  let assessedStudents = 0;
  let passCount = 0;
  let failCount = 0;

  for (const record of records) {
    const status = getStudentAssessmentStatus(record, selectedQuarter);
    const result = getRelevantAssessmentResult(record, selectedQuarter);

    statusCounts[status] += 1;

    if (result === "Pass" || result === "Fail") {
      assessedStudents += 1;
    }

    if (result === "Pass") {
      passCount += 1;
    }

    if (result === "Fail") {
      failCount += 1;
    }
  }

  return {
    totalStudents: new Set(records.map((record) => record.studentName.trim().toLowerCase())).size,
    assessedStudents,
    passCount,
    failCount,
    passRate: assessedStudents > 0 ? passCount / assessedStudents : 0,
    failRate: assessedStudents > 0 ? failCount / assessedStudents : 0,
    statusCounts
  };
}

export function getLatestAssessedQuarter(record: StudentAssessmentRecord) {
  return getRecordQuarters(record)
    .slice()
    .sort(compareAssessmentQuarters)
    .reverse()
    .find((quarter) => {
      const result = getQuarterResult(record, quarter);
      return result === "Pass" || result === "Fail";
    });
}

export function getRelevantAssessmentResult(
  record: StudentAssessmentRecord,
  selectedQuarter: "All" | AssessmentQuarter
) {
  if (selectedQuarter !== "All") {
    return getQuarterResult(record, selectedQuarter);
  }

  const latestQuarter = getRecordQuarters(record)
    .slice()
    .sort(compareAssessmentQuarters)
    .reverse()[0];

  return latestQuarter ? getQuarterResult(record, latestQuarter) : "";
}

export function getStatusBadgeClass(status: StudentAssessmentStatus) {
  if (status === "Require intervention") {
    return "border-orange-300 bg-orange-100 text-orange-800";
  }

  if (status === "Monitor") {
    return "border-yellow-300 bg-yellow-100 text-yellow-800";
  }

  if (status === "Ready to advance") {
    return "border-green-300 bg-green-100 text-green-800";
  }

  if (status === "Due for assessment") {
    return "border-slate-300 bg-slate-100 text-slate-700";
  }

  return "border-sky-200 bg-sky-50 text-sky-800";
}

function statusFromParts(
  flagStatus: FlagStatus,
  result: AssessmentResult | ""
): StudentAssessmentStatus {
  if (flagStatus === "Red") {
    return "Require intervention";
  }

  if (flagStatus === "Yellow") {
    return "Monitor";
  }

  if (result === "Pass") {
    return "Ready to advance";
  }

  if (result === "Absent" || isNotAssessedResult(result)) {
    return "Due for assessment";
  }

  return "On track";
}
