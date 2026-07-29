import type {
  ActionRequired,
  AssessmentFilters,
  AssessmentQuarter,
  AssessmentResult,
  CoachSummary,
  DashboardMetrics,
  FilterOptions,
  FlagStatus,
  QuarterAssessmentRow,
  QuarterMetrics,
  QuarterSummary,
  StudentAssessmentRecord
} from "@/types/assessment";

export const emptyFilters: AssessmentFilters = {
  search: "",
  coach: "All",
  centre: "All",
  level: "All",
  session: "All",
  flag: "All",
  quarter: "All",
  result: "All"
};

export const assessmentQuarters: AssessmentQuarter[] = ["Q1", "Q2"];
export const missingSessionLabel = "Not provided";

type QuarterFilter = "All" | AssessmentQuarter;

export function normalizeAssessmentResult(value: unknown): AssessmentResult {
  const cleaned = String(value ?? "")
    .replace(/\uFEFF/g, "")
    .trim()
    .toLowerCase();

  if (!cleaned || cleaned === "-" || cleaned === "n/a" || cleaned === "na") {
    return "";
  }

  if (["pass", "passed", "p"].includes(cleaned)) {
    return "Pass";
  }

  if (["fail", "failed", "f"].includes(cleaned)) {
    return "Fail";
  }

  if (["absent", "abs", "a"].includes(cleaned)) {
    return "Absent";
  }

  if (
    cleaned === "not assessed" ||
    cleaned === "not-assessed" ||
    cleaned === "not yet assessed" ||
    cleaned === "unassessed"
  ) {
    return "Not Assessed";
  }

  return "";
}

export function getFlagStatus(
  q1Result: AssessmentResult,
  q2Result: AssessmentResult
): FlagStatus {
  if (q1Result === "Fail" && q2Result === "Fail") {
    return "Red";
  }

  if (getLatestAssessedResult([q1Result, q2Result]) === "Fail") {
    return "Yellow";
  }

  return "None";
}

function getLatestAssessedResult(results: AssessmentResult[]) {
  for (let index = results.length - 1; index >= 0; index -= 1) {
    if (results[index] === "Pass" || results[index] === "Fail") {
      return results[index];
    }
  }

  return "";
}

export function getActionRequired(flagStatus: FlagStatus): ActionRequired {
  if (flagStatus === "Red") {
    return "Intervention Required";
  }

  if (flagStatus === "Yellow") {
    return "Monitor";
  }

  return "No immediate concern";
}

export function applyAssessmentLogic(
  record: Omit<
    StudentAssessmentRecord,
    "flagStatus" | "actionRequired" | "interventionRequired"
  > & {
    flagStatus?: FlagStatus;
    actionRequired?: ActionRequired;
    interventionRequired?: boolean;
  }
): StudentAssessmentRecord {
  const q1Result = normalizeAssessmentResult(record.q1Result);
  const q2Result = normalizeAssessmentResult(record.q2Result);

  // CSV files may include existing flag columns, but the dashboard treats the
  // explicit Q1/Q2 Fail results as the source of truth for intervention logic.
  const flagStatus = getFlagStatus(q1Result, q2Result);
  const actionRequired = getActionRequired(flagStatus);

  return {
    ...record,
    q1Result,
    q2Result,
    flagStatus,
    actionRequired,
    interventionRequired: flagStatus === "Red"
  };
}

function uniqueStudentKey(record: StudentAssessmentRecord) {
  return record.studentName.trim().toLowerCase();
}

function calculateQuarterMetrics(
  records: StudentAssessmentRecord[],
  quarter: "q1" | "q2"
): QuarterMetrics {
  const passCount = records.filter((record) => record[`${quarter}Result`] === "Pass").length;
  const failCount = records.filter((record) => record[`${quarter}Result`] === "Fail").length;
  const assessedCount = passCount + failCount;

  return {
    assessedCount,
    passCount,
    failCount,
    passRate: assessedCount > 0 ? passCount / assessedCount : 0
  };
}

export function calculateDashboardMetrics(
  records: StudentAssessmentRecord[]
): DashboardMetrics {
  return {
    totalUniqueStudents: new Set(records.map(uniqueStudentKey).filter(Boolean)).size,
    q1: calculateQuarterMetrics(records, "q1"),
    q2: calculateQuarterMetrics(records, "q2"),
    yellowFlagCount: records.filter((record) => record.flagStatus === "Yellow").length,
    redFlagCount: records.filter((record) => record.flagStatus === "Red").length,
    interventionRequiredCount: records.filter((record) => record.interventionRequired).length
  };
}

export function calculateCoachSummaries(
  records: StudentAssessmentRecord[],
  selectedQuarter: QuarterFilter = "All"
): CoachSummary[] {
  const grouped = new Map<
    string,
    {
      studentKeys: Set<string>;
      q1Records: StudentAssessmentRecord[];
      q2Records: StudentAssessmentRecord[];
      flaggedRecords: StudentAssessmentRecord[];
    }
  >();

  function ensureGroup(coachName: string) {
    const group =
      grouped.get(coachName) ??
      {
        studentKeys: new Set<string>(),
        q1Records: [],
        q2Records: [],
        flaggedRecords: []
      };

    grouped.set(coachName, group);
    return group;
  }

  function addQuarterRecord(
    record: StudentAssessmentRecord,
    quarter: AssessmentQuarter,
    includeConcern: boolean
  ) {
    const coachName = getQuarterCoachName(record, quarter);
    const studentKey = uniqueStudentKey(record);
    const group = ensureGroup(coachName);

    group.studentKeys.add(studentKey);

    if (quarter === "Q1") {
      group.q1Records.push(record);
    } else {
      group.q2Records.push(record);
    }

    if (includeConcern && record.flagStatus !== "None") {
      group.flaggedRecords.push(record);
    }
  }

  for (const record of records) {
    const studentKey = uniqueStudentKey(record);

    if (selectedQuarter === "Q1" || selectedQuarter === "Q2") {
      addQuarterRecord(record, selectedQuarter, true);
      continue;
    }

    addQuarterRecord(record, "Q1", false);
    addQuarterRecord(record, "Q2", false);

    const flagOwner = getLatestCoachName(record);
    const flagGroup = ensureGroup(flagOwner);

    if (record.flagStatus !== "None") {
      flagGroup.flaggedRecords.push(record);
      flagGroup.studentKeys.add(studentKey);
    }
  }

  return Array.from(grouped.entries())
    .map(([coachName, coachGroup]) => {
      const q1 = calculateQuarterMetrics(coachGroup.q1Records, "q1");
      const q2 = calculateQuarterMetrics(coachGroup.q2Records, "q2");
      const yellowFlagCount = coachGroup.flaggedRecords.filter(
        (record) => record.flagStatus === "Yellow"
      ).length;
      const redFlagCount = coachGroup.flaggedRecords.filter(
        (record) => record.flagStatus === "Red"
      ).length;
      const suggestedAction: CoachSummary["suggestedAction"] =
        redFlagCount > 0
          ? "Intervention Review"
          : yellowFlagCount > 0
            ? "Monitor"
            : "No immediate concern";

      return {
        coachName,
        totalStudents: coachGroup.studentKeys.size,
        q1AssessedCount: q1.assessedCount,
        q1PassCount: q1.passCount,
        q1FailCount: q1.failCount,
        q1PassRate: q1.passRate,
        q2AssessedCount: q2.assessedCount,
        q2PassCount: q2.passCount,
        q2FailCount: q2.failCount,
        q2PassRate: q2.passRate,
        yellowFlagCount,
        redFlagCount,
        suggestedAction
      };
    })
    .sort((a, b) => {
      if (b.redFlagCount !== a.redFlagCount) {
        return b.redFlagCount - a.redFlagCount;
      }

      if (b.yellowFlagCount !== a.yellowFlagCount) {
        return b.yellowFlagCount - a.yellowFlagCount;
      }

      return a.coachName.localeCompare(b.coachName);
    });
}

export function filterRecords(
  records: StudentAssessmentRecord[],
  filters: AssessmentFilters
): StudentAssessmentRecord[] {
  const search = filters.search.trim().toLowerCase();

  return records.filter((record) => {
    const searchableCoachNames =
      filters.quarter === "Q1" || filters.quarter === "Q2"
        ? [getQuarterCoachName(record, filters.quarter)]
        : [record.coachName, getQuarterCoachName(record, "Q1"), getQuarterCoachName(record, "Q2")];
    const matchesSearch =
      !search ||
      record.studentName.toLowerCase().includes(search) ||
      searchableCoachNames.some((coachName) => coachName.toLowerCase().includes(search));
    const matchesCoach = matchesQuarterAwareValue(record, filters, "coach", filters.coach);
    const matchesCentre = matchesQuarterAwareValue(record, filters, "centre", filters.centre);
    const matchesLevel = matchesQuarterAwareValue(record, filters, "level", filters.level);
    const matchesSession = matchesQuarterAwareValue(record, filters, "session", filters.session);
    const matchesFlag = filters.flag === "All" || record.flagStatus === filters.flag;
    const matchesQuarterResult = matchesSelectedQuarterResult(record, filters);

    return (
      matchesSearch &&
      matchesCoach &&
      matchesCentre &&
      matchesLevel &&
      matchesSession &&
      matchesFlag &&
      matchesQuarterResult
    );
  });
}

function matchesQuarterAwareValue(
  record: StudentAssessmentRecord,
  filters: AssessmentFilters,
  field: "coach" | "centre" | "level" | "session",
  selectedValue: string
) {
  if (selectedValue === "All") {
    return true;
  }

  const getter =
    field === "coach"
      ? getQuarterCoachName
      : field === "centre"
        ? getQuarterCentre
        : field === "level"
          ? getQuarterLevel
          : getQuarterSession;

  if (filters.quarter === "Q1" || filters.quarter === "Q2") {
    return valuesMatch(field, getter(record, filters.quarter), selectedValue);
  }

  return (
    valuesMatch(field, getter(record, "Q1"), selectedValue) ||
    valuesMatch(field, getter(record, "Q2"), selectedValue) ||
    valuesMatch(field, getCurrentValue(record, field), selectedValue)
  );
}

function valuesMatch(
  field: "coach" | "centre" | "level" | "session",
  currentValue: string,
  selectedValue: string
) {
  if (field === "centre") {
    return normalizeCentreName(currentValue) === normalizeCentreName(selectedValue);
  }

  return currentValue === selectedValue;
}

function matchesSelectedQuarterResult(
  record: StudentAssessmentRecord,
  filters: AssessmentFilters
) {
  if (filters.result === "All") {
    return true;
  }

  if (filters.quarter === "Q1") {
    return record.q1Result === filters.result;
  }

  if (filters.quarter === "Q2") {
    return record.q2Result === filters.result;
  }

  return record.q1Result === filters.result || record.q2Result === filters.result;
}

function getCurrentValue(record: StudentAssessmentRecord, field: "coach" | "centre" | "level" | "session") {
  if (field === "coach") {
    return record.coachName || "Unassigned";
  }

  if (field === "centre") {
    return record.centre || "";
  }

  if (field === "level") {
    return record.level || "";
  }

  return record.session || missingSessionLabel;
}

export function getQuarterResult(record: StudentAssessmentRecord, quarter: AssessmentQuarter) {
  return quarter === "Q1" ? record.q1Result : record.q2Result;
}

export function getQuarterCoachName(record: StudentAssessmentRecord, quarter: AssessmentQuarter) {
  return (
    (quarter === "Q1" ? record.q1CoachName : record.q2CoachName) ||
    record.coachName ||
    "Unassigned"
  );
}

export function getLatestCoachName(record: StudentAssessmentRecord) {
  return record.q2CoachName || record.q1CoachName || record.coachName || "Unassigned";
}

export function getQuarterCentre(record: StudentAssessmentRecord, quarter: AssessmentQuarter) {
  return (quarter === "Q1" ? record.q1Centre : record.q2Centre) || record.centre || "";
}

export function getQuarterLevel(record: StudentAssessmentRecord, quarter: AssessmentQuarter) {
  return (quarter === "Q1" ? record.q1Level : record.q2Level) || record.level || "";
}

export function getQuarterSession(record: StudentAssessmentRecord, quarter: AssessmentQuarter) {
  return (
    (quarter === "Q1" ? record.q1Session : record.q2Session) ||
    record.session ||
    missingSessionLabel
  );
}

export function toQuarterAssessmentRows(
  records: StudentAssessmentRecord[]
): QuarterAssessmentRow[] {
  return records.flatMap((record) =>
    assessmentQuarters.map((quarter) => ({
      id: `${record.id}-${quarter}`,
      studentName: record.studentName,
      quarter,
      coachName: getQuarterCoachName(record, quarter),
      centre: getQuarterCentre(record, quarter) || "-",
      level: getQuarterLevel(record, quarter) || "-",
      session: getQuarterSession(record, quarter),
      result: getQuarterResult(record, quarter),
      flagStatus: record.flagStatus,
      actionRequired: record.actionRequired
    }))
  );
}

export function filterQuarterRows(
  rows: QuarterAssessmentRow[],
  filters: AssessmentFilters
): QuarterAssessmentRow[] {
  const search = filters.search.trim().toLowerCase();

  return rows.filter((row) => {
    const matchesSearch =
      !search ||
      row.studentName.toLowerCase().includes(search) ||
      row.coachName.toLowerCase().includes(search);
    const matchesCoach = filters.coach === "All" || row.coachName === filters.coach;
    const matchesCentre =
      filters.centre === "All" ||
      normalizeCentreName(row.centre) === normalizeCentreName(filters.centre);
    const matchesLevel = filters.level === "All" || row.level === filters.level;
    const matchesSession = filters.session === "All" || row.session === filters.session;
    const matchesFlag = filters.flag === "All" || row.flagStatus === filters.flag;
    const matchesQuarter = filters.quarter === "All" || row.quarter === filters.quarter;
    const matchesResult = filters.result === "All" || row.result === filters.result;

    return (
      matchesSearch &&
      matchesCoach &&
      matchesCentre &&
      matchesLevel &&
      matchesSession &&
      matchesFlag &&
      matchesQuarter &&
      matchesResult
    );
  });
}

export function calculateQuarterSummaries(rows: QuarterAssessmentRow[]): QuarterSummary[] {
  const grouped = new Map<string, QuarterAssessmentRow[]>();

  for (const row of rows) {
    const key = [row.quarter, row.session, row.centre, row.coachName].join("||");
    const group = grouped.get(key) ?? [];
    group.push(row);
    grouped.set(key, group);
  }

  return Array.from(grouped.entries())
    .map(([id, group]) => {
      const first = group[0];
      const passCount = group.filter((row) => row.result === "Pass").length;
      const failCount = group.filter((row) => row.result === "Fail").length;
      const assessedCount = passCount + failCount;
      const redFlagCount = group.filter((row) => row.flagStatus === "Red").length;
      const yellowFlagCount = group.filter((row) => row.flagStatus === "Yellow").length;
      const suggestedAction: QuarterSummary["suggestedAction"] =
        redFlagCount > 0
          ? "Intervention Review"
          : yellowFlagCount > 0
            ? "Monitor"
            : "No immediate concern";

      return {
        id,
        quarter: first.quarter,
        session: first.session,
        centre: first.centre,
        coachName: first.coachName,
        totalStudents: new Set(group.map((row) => row.studentName.trim().toLowerCase())).size,
        assessedCount,
        passCount,
        failCount,
        passRate: assessedCount > 0 ? passCount / assessedCount : 0,
        yellowFlagCount,
        redFlagCount,
        suggestedAction
      };
    })
    .sort((a, b) => {
      if (a.quarter !== b.quarter) {
        return a.quarter.localeCompare(b.quarter);
      }

      if (a.session !== b.session) {
        return a.session.localeCompare(b.session);
      }

      return a.coachName.localeCompare(b.coachName);
    });
}

function uniqueSorted(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])).sort(
    (a, b) => a.localeCompare(b)
  );
}

function normalizeCentreName(centre: string) {
  return centre.trim().toLowerCase();
}

function uniqueResults(values: AssessmentResult[]): AssessmentResult[] {
  const order: AssessmentResult[] = ["Pass", "Fail", "Absent", "Not Assessed", ""];
  const present = new Set(values);
  return order.filter((value) => present.has(value));
}

export function getFilterOptions(
  records: StudentAssessmentRecord[],
  selectedQuarter: QuarterFilter = "All"
): FilterOptions {
  if (selectedQuarter === "Q1" || selectedQuarter === "Q2") {
    return {
      coaches: uniqueSorted(records.map((record) => getQuarterCoachName(record, selectedQuarter))),
      centres: uniqueSorted(records.map((record) => getQuarterCentre(record, selectedQuarter))),
      levels: uniqueSorted(records.map((record) => getQuarterLevel(record, selectedQuarter))),
      sessions: uniqueSorted(records.map((record) => getQuarterSession(record, selectedQuarter))),
      quarters: assessmentQuarters,
      results: uniqueResults(records.map((record) => getQuarterResult(record, selectedQuarter)))
    };
  }

  return {
    coaches: uniqueSorted(
      records.flatMap((record) => [
        record.coachName,
        getQuarterCoachName(record, "Q1"),
        getQuarterCoachName(record, "Q2")
      ])
    ),
    centres: uniqueSorted(
      records.flatMap((record) => [record.centre, getQuarterCentre(record, "Q1"), getQuarterCentre(record, "Q2")])
    ),
    levels: uniqueSorted(
      records.flatMap((record) => [record.level, getQuarterLevel(record, "Q1"), getQuarterLevel(record, "Q2")])
    ),
    sessions: uniqueSorted(
      records.flatMap((record) => [
        record.session,
        getQuarterSession(record, "Q1"),
        getQuarterSession(record, "Q2")
      ])
    ),
    quarters: assessmentQuarters,
    results: uniqueResults(records.flatMap((record) => [record.q1Result, record.q2Result]))
  };
}

export function formatPercent(rate: number) {
  return `${Math.round(rate * 100)}%`;
}
