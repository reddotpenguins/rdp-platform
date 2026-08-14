import type {
  ActionRequired,
  AssessmentFilters,
  AssessmentQuarter,
  AssessmentResult,
  CoachSummary,
  DashboardMetrics,
  FilterOptions,
  FlagStatus,
  QuarterAssessmentDetails,
  QuarterAssessmentRow,
  QuarterMetrics,
  QuarterSummary,
  SessionPeriod,
  StudentAssessmentRecord
} from "@/types/assessment";

export const emptyFilters: AssessmentFilters = {
  search: "",
  coach: "All",
  centre: "All",
  level: "All",
  session: "All",
  sessionDay: "All",
  sessionPeriod: "All",
  flag: "All",
  quarter: "All",
  result: "All"
};

export const assessmentQuarters: AssessmentQuarter[] = ["Q1", "Q2"];
export const missingSessionLabel = "Not provided";
const sessionPeriods: SessionPeriod[] = ["AM", "PM"];
const sessionDayOrder = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];
const sessionDayPatterns = [
  { day: "Monday", pattern: /\bmon(?:day)?\b/i },
  { day: "Tuesday", pattern: /\btue(?:sday)?\b/i },
  { day: "Wednesday", pattern: /\bwed(?:nesday)?\b/i },
  { day: "Thursday", pattern: /\bthu(?:r|rs|rsday)?\b/i },
  { day: "Friday", pattern: /\bfri(?:day)?\b/i },
  { day: "Saturday", pattern: /\bsat(?:urday)?\b/i },
  { day: "Sunday", pattern: /\bsun(?:day)?\b/i }
];

type QuarterFilter = "All" | AssessmentQuarter;

const emptyQuarterMetrics: QuarterMetrics = {
  assessedCount: 0,
  failCount: 0,
  passCount: 0,
  passRate: 0,
  totalCount: 0
};

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

export function normalizeAssessmentQuarter(value: unknown): AssessmentQuarter | "" {
  const cleaned = String(value ?? "")
    .replace(/\uFEFF/g, "")
    .trim()
    .toUpperCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  const match =
    cleaned.match(/^(?:20\d{2} )?Q([1-9]\d*)$/) ??
    cleaned.match(/^([1-9]\d*)$/) ??
    cleaned.match(/^(?:20\d{2} )?QUARTER ([1-9]\d*)$/);

  return match ? (`Q${match[1]}` as AssessmentQuarter) : "";
}

export function compareAssessmentQuarters(first: AssessmentQuarter, second: AssessmentQuarter) {
  const firstNumber = getQuarterNumber(first);
  const secondNumber = getQuarterNumber(second);

  if (firstNumber !== secondNumber) {
    return firstNumber - secondNumber;
  }

  return first.localeCompare(second);
}

export function getQuarterNumber(quarter: AssessmentQuarter) {
  const match = quarter.match(/^Q([1-9]\d*)$/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

export function getFlagStatus(
  q1Result: AssessmentResult,
  q2Result: AssessmentResult
): FlagStatus {
  return getFlagStatusFromResults([q1Result, q2Result]);
}

function getFlagStatusFromResults(results: AssessmentResult[]): FlagStatus {
  const normalizedResults = results.map(normalizeAssessmentResult);
  const latestIndex = findLatestPassFailIndex(normalizedResults);

  if (latestIndex === -1) {
    return "None";
  }

  if (normalizedResults[latestIndex] === "Pass") {
    return "None";
  }

  let consecutiveFailCount = 1;

  for (let index = latestIndex - 1; index >= 0; index -= 1) {
    if (normalizedResults[index] !== "Fail") {
      break;
    }

    consecutiveFailCount += 1;
  }

  return consecutiveFailCount >= 2 ? "Red" : "Yellow";
}

function findLatestPassFailIndex(results: AssessmentResult[]) {
  for (let index = results.length - 1; index >= 0; index -= 1) {
    if (results[index] === "Pass" || results[index] === "Fail") {
      return index;
    }
  }

  return -1;
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
  const quarterDetails = normalizeQuarterDetails(record);
  const q1Result = quarterDetails.Q1?.result ?? normalizeAssessmentResult(record.q1Result);
  const q2Result = quarterDetails.Q2?.result ?? normalizeAssessmentResult(record.q2Result);
  const resultHistory = sortAssessmentQuarters(Object.keys(quarterDetails) as AssessmentQuarter[]).map(
    (quarter) => quarterDetails[quarter]?.result ?? ""
  );
  const flagStatus = getFlagStatusFromResults(resultHistory);
  const actionRequired = getActionRequired(flagStatus);

  return {
    ...record,
    q1Result,
    q2Result,
    quarterDetails,
    flagStatus,
    actionRequired,
    interventionRequired: flagStatus === "Red"
  };
}

function normalizeQuarterDetails(
  record: Partial<StudentAssessmentRecord>
): Partial<Record<AssessmentQuarter, QuarterAssessmentDetails>> {
  const details: Partial<Record<AssessmentQuarter, QuarterAssessmentDetails>> = {};

  for (const [quarter, value] of Object.entries(record.quarterDetails ?? {})) {
    const normalizedQuarter = normalizeAssessmentQuarter(quarter);

    if (!normalizedQuarter || !value) {
      continue;
    }

    const detail = normalizeQuarterDetail(value);

    if (quarterHasMeaningfulData(detail)) {
      details[normalizedQuarter] = detail;
    }
  }

  const q1Detail = normalizeQuarterDetail({
    coachName: record.q1CoachName,
    centre: record.q1Centre,
    level: record.q1Level,
    session: record.q1Session,
    result: record.q1Result ?? ""
  });
  const q2Detail = normalizeQuarterDetail({
    coachName: record.q2CoachName,
    centre: record.q2Centre,
    level: record.q2Level,
    session: record.q2Session,
    result: record.q2Result ?? ""
  });

  if (quarterHasMeaningfulData(q1Detail)) {
    details.Q1 = {
      ...q1Detail,
      ...details.Q1,
      result: details.Q1?.result ?? q1Detail.result
    };
  }

  if (quarterHasMeaningfulData(q2Detail)) {
    details.Q2 = {
      ...q2Detail,
      ...details.Q2,
      result: details.Q2?.result ?? q2Detail.result
    };
  }

  return details;
}

function normalizeQuarterDetail(
  detail: Partial<QuarterAssessmentDetails>
): QuarterAssessmentDetails {
  return {
    coachName: cleanOptionalText(detail.coachName),
    centre: cleanOptionalText(detail.centre),
    level: cleanOptionalText(detail.level),
    session: cleanOptionalText(detail.session),
    result: normalizeAssessmentResult(detail.result)
  };
}

function cleanOptionalText(value: string | undefined) {
  const cleaned = String(value ?? "").replace(/\uFEFF/g, "").trim();
  return cleaned || undefined;
}

function quarterHasMeaningfulData(detail: Partial<QuarterAssessmentDetails> | undefined) {
  return Boolean(
    detail &&
      (detail.coachName || detail.centre || detail.level || detail.session || detail.result)
  );
}

function uniqueStudentKey(record: StudentAssessmentRecord) {
  return record.studentName.trim().toLowerCase();
}

export function getRecordQuarters(record: StudentAssessmentRecord): AssessmentQuarter[] {
  const quarterSet = new Set<AssessmentQuarter>();

  for (const quarter of Object.keys(record.quarterDetails ?? {})) {
    const normalizedQuarter = normalizeAssessmentQuarter(quarter);

    if (normalizedQuarter && recordHasQuarter(record, normalizedQuarter)) {
      quarterSet.add(normalizedQuarter);
    }
  }

  for (const quarter of assessmentQuarters) {
    if (recordHasQuarter(record, quarter)) {
      quarterSet.add(quarter);
    }
  }

  return sortAssessmentQuarters(Array.from(quarterSet));
}

export function getAvailableQuarters(records: StudentAssessmentRecord[]) {
  const quarterSet = new Set<AssessmentQuarter>();

  records.forEach((record) => {
    getRecordQuarters(record).forEach((quarter) => quarterSet.add(quarter));
  });

  const quarters = sortAssessmentQuarters(Array.from(quarterSet));
  return quarters.length > 0 ? quarters : assessmentQuarters;
}

export function getDisplayedQuarters(
  records: StudentAssessmentRecord[],
  selectedQuarter: QuarterFilter
) {
  return selectedQuarter === "All" ? getAvailableQuarters(records) : [selectedQuarter];
}

function sortAssessmentQuarters(quarters: AssessmentQuarter[]) {
  return Array.from(new Set(quarters)).sort(compareAssessmentQuarters);
}

function calculateQuarterMetrics(
  records: StudentAssessmentRecord[],
  quarter: AssessmentQuarter
): QuarterMetrics {
  const quarterRecords = records.filter((record) => recordHasQuarter(record, quarter));
  const passCount = quarterRecords.filter((record) => getQuarterResult(record, quarter) === "Pass")
    .length;
  const failCount = quarterRecords.filter((record) => getQuarterResult(record, quarter) === "Fail")
    .length;
  const assessedCount = passCount + failCount;
  const totalCount = quarterRecords.length;

  return {
    totalCount,
    assessedCount,
    passCount,
    failCount,
    passRate: assessedCount > 0 ? passCount / assessedCount : 0
  };
}

export function calculateDashboardMetrics(
  records: StudentAssessmentRecord[]
): DashboardMetrics {
  const quarters = getAvailableQuarters(records);
  const quarterMetrics: Partial<Record<AssessmentQuarter, QuarterMetrics>> = {};

  for (const quarter of quarters) {
    quarterMetrics[quarter] = calculateQuarterMetrics(records, quarter);
  }

  return {
    totalUniqueStudents: new Set(records.map(uniqueStudentKey).filter(Boolean)).size,
    quarters: quarterMetrics,
    q1: quarterMetrics.Q1 ?? emptyQuarterMetrics,
    q2: quarterMetrics.Q2 ?? emptyQuarterMetrics,
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
      quarterRecords: Partial<Record<AssessmentQuarter, StudentAssessmentRecord[]>>;
      flaggedRecords: StudentAssessmentRecord[];
    }
  >();

  function ensureGroup(coachName: string) {
    const group =
      grouped.get(coachName) ??
      {
        studentKeys: new Set<string>(),
        quarterRecords: {},
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
    const quarterRecords = group.quarterRecords[quarter] ?? [];

    group.studentKeys.add(studentKey);
    quarterRecords.push(record);
    group.quarterRecords[quarter] = quarterRecords;

    if (includeConcern && record.flagStatus !== "None") {
      group.flaggedRecords.push(record);
    }
  }

  for (const record of records) {
    const studentKey = uniqueStudentKey(record);

    if (selectedQuarter !== "All") {
      if (recordHasQuarter(record, selectedQuarter)) {
        addQuarterRecord(record, selectedQuarter, true);
      }
      continue;
    }

    for (const quarter of getRecordQuarters(record)) {
      addQuarterRecord(record, quarter, false);
    }

    const flagOwner = getLatestCoachName(record);
    const flagGroup = ensureGroup(flagOwner);

    if (record.flagStatus !== "None") {
      flagGroup.flaggedRecords.push(record);
      flagGroup.studentKeys.add(studentKey);
    }
  }

  return Array.from(grouped.entries())
    .map(([coachName, coachGroup]) => {
      const quarters: CoachSummary["quarters"] = {};

      for (const [quarter, quarterRecords] of Object.entries(coachGroup.quarterRecords)) {
        const normalizedQuarter = normalizeAssessmentQuarter(quarter);

        if (!normalizedQuarter) {
          continue;
        }

        const metrics = calculateQuarterMetrics(quarterRecords ?? [], normalizedQuarter);
        quarters[normalizedQuarter] = {
          ...metrics,
          failRate: metrics.totalCount > 0 ? metrics.failCount / metrics.totalCount : 0
        };
      }

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
        quarters,
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
      filters.quarter === "All"
        ? [record.coachName, ...getRecordQuarters(record).map((quarter) => getQuarterCoachName(record, quarter))]
        : [getQuarterCoachName(record, filters.quarter)];
    const matchesSearch =
      !search ||
      record.studentName.toLowerCase().includes(search) ||
      searchableCoachNames.some((coachName) => coachName.toLowerCase().includes(search));
    const matchesCoach = matchesQuarterAwareValue(record, filters, "coach", filters.coach);
    const matchesCentre = matchesQuarterAwareValue(record, filters, "centre", filters.centre);
    const matchesLevel = matchesQuarterAwareValue(record, filters, "level", filters.level);
    const matchesSession = matchesQuarterAwareValue(record, filters, "session", filters.session);
    const matchesSessionDay = matchesQuarterAwareSessionDetail(
      record,
      filters,
      filters.sessionDay,
      getSessionDay
    );
    const matchesSessionPeriod = matchesQuarterAwareSessionDetail(
      record,
      filters,
      filters.sessionPeriod,
      getSessionPeriod
    );
    const matchesFlag = filters.flag === "All" || record.flagStatus === filters.flag;
    const matchesQuarterResult = matchesSelectedQuarterResult(record, filters);

    return (
      matchesSearch &&
      matchesCoach &&
      matchesCentre &&
      matchesLevel &&
      matchesSession &&
      matchesSessionDay &&
      matchesSessionPeriod &&
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

  if (filters.quarter !== "All") {
    return valuesMatch(field, getter(record, filters.quarter), selectedValue);
  }

  return (
    getRecordQuarters(record).some((quarter) =>
      valuesMatch(field, getter(record, quarter), selectedValue)
    ) || valuesMatch(field, getCurrentValue(record, field), selectedValue)
  );
}

function matchesQuarterAwareSessionDetail(
  record: StudentAssessmentRecord,
  filters: AssessmentFilters,
  selectedValue: string,
  getDetail: (session: string) => string
) {
  if (selectedValue === "All") {
    return true;
  }

  return getQuarterAwareSessionValues(record, filters.quarter).some(
    (session) => getDetail(session) === selectedValue
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

  if (filters.quarter !== "All") {
    return getQuarterResult(record, filters.quarter) === filters.result;
  }

  return getRecordQuarters(record).some(
    (quarter) => getQuarterResult(record, quarter) === filters.result
  );
}

function getQuarterAwareSessionValues(
  record: StudentAssessmentRecord,
  selectedQuarter: QuarterFilter
) {
  if (selectedQuarter !== "All") {
    return [getQuarterSession(record, selectedQuarter)];
  }

  return uniqueSorted([
    record.session,
    ...getRecordQuarters(record).map((quarter) => getQuarterSession(record, quarter))
  ]);
}

function getCurrentValue(
  record: StudentAssessmentRecord,
  field: "coach" | "centre" | "level" | "session"
) {
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
  return getQuarterDetail(record, quarter)?.result ?? "";
}

export function getQuarterCoachName(record: StudentAssessmentRecord, quarter: AssessmentQuarter) {
  return getQuarterDetail(record, quarter)?.coachName || record.coachName || "Unassigned";
}

export function getLatestCoachName(record: StudentAssessmentRecord) {
  const quarters = getRecordQuarters(record).slice().sort(compareAssessmentQuarters).reverse();

  for (const quarter of quarters) {
    const coachName = getQuarterDetail(record, quarter)?.coachName;

    if (coachName) {
      return coachName;
    }
  }

  return record.coachName || "Unassigned";
}

export function getQuarterCentre(record: StudentAssessmentRecord, quarter: AssessmentQuarter) {
  return getQuarterDetail(record, quarter)?.centre || record.centre || "";
}

export function getQuarterLevel(record: StudentAssessmentRecord, quarter: AssessmentQuarter) {
  return getQuarterDetail(record, quarter)?.level || record.level || "";
}

export function getQuarterSession(record: StudentAssessmentRecord, quarter: AssessmentQuarter) {
  return getQuarterDetail(record, quarter)?.session || record.session || missingSessionLabel;
}

export function recordHasQuarter(record: StudentAssessmentRecord, quarter: AssessmentQuarter) {
  return quarterHasMeaningfulData(getQuarterDetail(record, quarter));
}

function getQuarterDetail(record: StudentAssessmentRecord, quarter: AssessmentQuarter) {
  const detail = record.quarterDetails?.[quarter];

  if (detail) {
    return detail;
  }

  if (quarter === "Q1") {
    return normalizeQuarterDetail({
      coachName: record.q1CoachName,
      centre: record.q1Centre,
      level: record.q1Level,
      session: record.q1Session,
      result: record.q1Result
    });
  }

  if (quarter === "Q2") {
    return normalizeQuarterDetail({
      coachName: record.q2CoachName,
      centre: record.q2Centre,
      level: record.q2Level,
      session: record.q2Session,
      result: record.q2Result
    });
  }

  return undefined;
}

export function toQuarterAssessmentRows(
  records: StudentAssessmentRecord[]
): QuarterAssessmentRow[] {
  return records.flatMap((record) =>
    getRecordQuarters(record).map((quarter) => ({
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
    const matchesSessionDay =
      filters.sessionDay === "All" || getSessionDay(row.session) === filters.sessionDay;
    const matchesSessionPeriod =
      filters.sessionPeriod === "All" || getSessionPeriod(row.session) === filters.sessionPeriod;
    const matchesFlag = filters.flag === "All" || row.flagStatus === filters.flag;
    const matchesQuarter = filters.quarter === "All" || row.quarter === filters.quarter;
    const matchesResult = filters.result === "All" || row.result === filters.result;

    return (
      matchesSearch &&
      matchesCoach &&
      matchesCentre &&
      matchesLevel &&
      matchesSession &&
      matchesSessionDay &&
      matchesSessionPeriod &&
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
        return compareAssessmentQuarters(a.quarter, b.quarter);
      }

      if (a.session !== b.session) {
        return compareSessionLabels(a.session, b.session);
      }

      return a.coachName.localeCompare(b.coachName);
    });
}

function uniqueSorted(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])).sort(
    (a, b) => a.localeCompare(b)
  );
}

function uniqueSessionDays(values: Array<string | undefined>) {
  const detectedDays = Array.from(
    new Set(values.map((value) => getSessionDay(value ?? "")).filter(Boolean))
  );

  if (detectedDays.length === 0) {
    return sessionDayOrder;
  }

  return detectedDays.sort((a, b) => {
    const firstIndex = sessionDayOrder.indexOf(a);
    const secondIndex = sessionDayOrder.indexOf(b);

    if (firstIndex !== -1 || secondIndex !== -1) {
      const firstOrder = firstIndex === -1 ? Number.MAX_SAFE_INTEGER : firstIndex;
      const secondOrder = secondIndex === -1 ? Number.MAX_SAFE_INTEGER : secondIndex;
      return firstOrder - secondOrder;
    }

    return a.localeCompare(b);
  });
}

function uniqueSessionPeriods() {
  return sessionPeriods;
}

function normalizeCentreName(centre: string) {
  return centre.trim().toLowerCase();
}

export function getSessionDay(session: string) {
  const cleaned = session.trim();

  if (!cleaned || cleaned === missingSessionLabel) {
    return "";
  }

  return sessionDayPatterns.find(({ pattern }) => pattern.test(cleaned))?.day ?? "";
}

export function getSessionPeriod(session: string): SessionPeriod | "" {
  const cleaned = session.trim();

  if (!cleaned || cleaned === missingSessionLabel) {
    return "";
  }

  if (/(^|[^a-z])a\.?\s?m\.?([^a-z]|$)/i.test(cleaned) || /\bmorning\b/i.test(cleaned)) {
    return "AM";
  }

  if (
    /(^|[^a-z])p\.?\s?m\.?([^a-z]|$)/i.test(cleaned) ||
    /\b(afternoon|evening|night)\b/i.test(cleaned)
  ) {
    return "PM";
  }

  const twentyFourHourMatch = cleaned.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);

  if (!twentyFourHourMatch) {
    return "";
  }

  const hour = Number(twentyFourHourMatch[1]);

  if (hour >= 12) {
    return "PM";
  }

  if (/^\d{2}[:.]/.test(twentyFourHourMatch[0]) || hour >= 6) {
    return "AM";
  }

  return "";
}

export function compareSessionLabels(first: string, second: string) {
  const firstSort = getSessionSortParts(first);
  const secondSort = getSessionSortParts(second);

  if (firstSort.dayOrder !== secondSort.dayOrder) {
    return firstSort.dayOrder - secondSort.dayOrder;
  }

  if (firstSort.periodOrder !== secondSort.periodOrder) {
    return firstSort.periodOrder - secondSort.periodOrder;
  }

  if (firstSort.startMinutes !== secondSort.startMinutes) {
    return firstSort.startMinutes - secondSort.startMinutes;
  }

  return firstSort.label.localeCompare(secondSort.label);
}

function getSessionSortParts(session: string) {
  const label = session.trim();
  const day = getSessionDay(label);
  const period = getSessionPeriod(label);
  const dayIndex = sessionDayOrder.indexOf(day);

  return {
    label,
    dayOrder: dayIndex === -1 ? Number.MAX_SAFE_INTEGER : dayIndex,
    periodOrder: period === "AM" ? 0 : period === "PM" ? 1 : 2,
    startMinutes: getSessionStartMinutes(label, period)
  };
}

function getSessionStartMinutes(session: string, period: SessionPeriod | "") {
  const timeMatch = session.match(
    /(^|[^a-z0-9])([01]?\d|2[0-3])(?:[:.](\d{2}))?\s*([ap]\.?\s?m\.?)?/i
  );

  if (!timeMatch) {
    return Number.MAX_SAFE_INTEGER;
  }

  let hour = Number(timeMatch[2]);
  const minute = Number(timeMatch[3] ?? 0);
  const meridiem = timeMatch[4]?.toLowerCase().replace(/[^apm]/g, "");

  if (meridiem?.startsWith("p") && hour < 12) {
    hour += 12;
  } else if (meridiem?.startsWith("a") && hour === 12) {
    hour = 0;
  } else if (!meridiem && period === "PM" && hour < 12) {
    hour += 12;
  } else if (!meridiem && period === "AM" && hour === 12) {
    hour = 0;
  }

  return hour * 60 + minute;
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
  const quarters = getAvailableQuarters(records);

  if (selectedQuarter !== "All") {
    const quarterRecords = records.filter((record) => recordHasQuarter(record, selectedQuarter));
    const sessions = quarterRecords.map((record) => getQuarterSession(record, selectedQuarter));

    return {
      coaches: uniqueSorted(quarterRecords.map((record) => getQuarterCoachName(record, selectedQuarter))),
      centres: uniqueSorted(quarterRecords.map((record) => getQuarterCentre(record, selectedQuarter))),
      levels: uniqueSorted(quarterRecords.map((record) => getQuarterLevel(record, selectedQuarter))),
      sessions: uniqueSorted(sessions),
      sessionDays: uniqueSessionDays(sessions),
      sessionPeriods: uniqueSessionPeriods(),
      quarters,
      results: uniqueResults(quarterRecords.map((record) => getQuarterResult(record, selectedQuarter)))
    };
  }

  const recordQuarters = records.flatMap((record) => getRecordQuarters(record));
  const sessions = records.flatMap((record) => [
    record.session,
    ...getRecordQuarters(record).map((quarter) => getQuarterSession(record, quarter))
  ]);

  return {
    coaches: uniqueSorted(
      records.flatMap((record) => [
        record.coachName,
        ...getRecordQuarters(record).map((quarter) => getQuarterCoachName(record, quarter))
      ])
    ),
    centres: uniqueSorted(
      records.flatMap((record) => [
        record.centre,
        ...getRecordQuarters(record).map((quarter) => getQuarterCentre(record, quarter))
      ])
    ),
    levels: uniqueSorted(
      records.flatMap((record) => [
        record.level,
        ...getRecordQuarters(record).map((quarter) => getQuarterLevel(record, quarter))
      ])
    ),
    sessions: uniqueSorted(sessions),
    sessionDays: uniqueSessionDays(sessions),
    sessionPeriods: uniqueSessionPeriods(),
    quarters: recordQuarters.length > 0 ? quarters : assessmentQuarters,
    results: uniqueResults(
      records.flatMap((record) =>
        getRecordQuarters(record).map((quarter) => getQuarterResult(record, quarter))
      )
    )
  };
}

export function formatPercent(rate: number) {
  return `${Math.round(rate * 100)}%`;
}
