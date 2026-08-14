import Papa from "papaparse";
import {
  applyAssessmentLogic,
  compareAssessmentQuarters,
  getSessionDay,
  getSessionPeriod,
  isClassBandLevel,
  normalizeAssessmentQuarter,
  normalizeAssessmentResult
} from "./assessmentLogic.ts";
import type {
  AssessmentQuarter,
  QuarterAssessmentDetails,
  StudentAssessmentRecord
} from "../types/assessment.ts";

type RawAssessmentRow = Record<string, unknown>;

type ParseAssessmentOptions = {
  defaultYear?: string;
  sourceName?: string;
};

type ParsedUploadResult = {
  records: StudentAssessmentRecord[];
  fileName: string;
  rowCount: number;
};

const aliases = {
  studentCode: ["Student Code", "student_code", "Student ID", "Student No", "ID"],
  studentName: ["Student Name", "Name", "Student"],
  coachName: ["Current Coach", "Coach", "Coach Name"],
  centre: ["Centre", "Center", "Location", "Current Centre"],
  level: ["Current Level", "Q3 Assessed Level", "Q2 Current Level", "Q1 Current Level", "Level"],
  session: [
    "Session",
    "Session Time",
    "Class Session",
    "Class Time",
    "Lesson Time",
    "Time",
    "Timing",
    "Time Slot"
  ],
  sessionDay: ["Day", "Session Day", "Class Day", "Lesson Day", "Weekday"],
  sessionPeriod: ["AM/PM", "AM PM", "Period", "Session Period", "Time of Day"],
  flagStatus: ["Flag Status", "Flag"],
  actionRequired: ["Action Required", "Action"]
};

const quarterFieldNames = {
  coachName: ["Coach", "Coach Name"],
  centre: ["Centre", "Center", "Location"],
  level: ["Current Level", "Assessed Level", "Tested Level", "Level"],
  session: [
    "Session",
    "Session Time",
    "Class Time",
    "Lesson Time",
    "Time",
    "Timing",
    "Time Slot"
  ],
  sessionDay: ["Day", "Session Day", "Class Day", "Lesson Day", "Weekday"],
  sessionPeriod: ["AM/PM", "AM PM", "Period", "Session Period", "Time of Day"],
  result: ["Result", "Assessment Result"]
};

function normalizeHeader(header: string) {
  return header
    .replace(/\uFEFF/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function rowLookup(row: RawAssessmentRow) {
  const lookup = new Map<string, unknown>();

  for (const [key, value] of Object.entries(row)) {
    lookup.set(normalizeHeader(key), value);
  }

  return lookup;
}

function pickValue(row: RawAssessmentRow, candidateHeaders: string[]) {
  const lookup = rowLookup(row);

  for (const header of candidateHeaders) {
    const value = lookup.get(normalizeHeader(header));

    if (value !== undefined && String(value ?? "").trim() !== "") {
      return value;
    }
  }

  return "";
}

function pickQuarterResult(row: RawAssessmentRow, quarter: AssessmentQuarter) {
  const quarterNumber = quarter.replace(/^Q/i, "");
  const fallback = pickValue(row, [
    quarter,
    `${quarter} Result`,
    `Quarter ${quarterNumber}`,
    `Quarter ${quarterNumber} Result`,
    ...buildQuarterHeaders(quarter, quarterFieldNames.result)
  ]);

  if (String(fallback ?? "").trim() !== "") {
    return fallback;
  }

  for (const [header, value] of Object.entries(row)) {
    const normalized = normalizeHeader(header);
    const hasValue = String(value ?? "").trim() !== "";
    const matchesQuarter =
      new RegExp(`^(20\\d{2} )?q${quarterNumber}( result)?$`).test(normalized) ||
      new RegExp(`^(20\\d{2} )?quarter ${quarterNumber}( result)?$`).test(normalized);

    if (hasValue && matchesQuarter) {
      return value;
    }
  }

  return "";
}

function pickQuarterField(
  row: RawAssessmentRow,
  quarter: AssessmentQuarter,
  fallbackHeaders: string[],
  fieldNames: string[]
) {
  const fallback = pickValue(row, fallbackHeaders);

  if (String(fallback ?? "").trim() !== "") {
    return fallback;
  }

  const quarterNumber = quarter.replace(/^Q/i, "");
  const quarterPrefix = new RegExp(`^(20\\d{2} )?(q${quarterNumber}|quarter ${quarterNumber}) `);
  const normalizedFieldNames = fieldNames.map(normalizeHeader);

  for (const [header, value] of Object.entries(row)) {
    const normalized = normalizeHeader(header);
    const fieldName = normalized.replace(quarterPrefix, "");

    if (String(value ?? "").trim() !== "" && normalizedFieldNames.includes(fieldName)) {
      return value;
    }
  }

  return "";
}

function buildQuarterHeaders(quarter: AssessmentQuarter, fieldNames: string[]) {
  const quarterNumber = quarter.replace(/^Q/i, "");
  const prefixes = [quarter, `Quarter ${quarterNumber}`];

  return prefixes.flatMap((prefix) => fieldNames.map((fieldName) => `${prefix} ${fieldName}`));
}

function textValue(value: unknown) {
  return String(value ?? "").replace(/\uFEFF/g, "").trim();
}

function normalizeSessionDayLabel(value: string) {
  return getSessionDay(value) || value;
}

function normalizeSessionPeriodLabel(value: string) {
  return getSessionPeriod(value) || value.toUpperCase();
}

function combineSessionParts(session: string, day: string, period: string) {
  const cleanedSession = textValue(session);

  if (!cleanedSession) {
    return "";
  }

  const cleanedDay = normalizeSessionDayLabel(textValue(day));
  const cleanedPeriod = normalizeSessionPeriodLabel(textValue(period));
  const parts: string[] = [];

  if (cleanedDay && getSessionDay(cleanedSession) !== cleanedDay) {
    parts.push(cleanedDay);
  }

  if (cleanedPeriod && getSessionPeriod(cleanedSession) !== cleanedPeriod) {
    parts.push(cleanedPeriod);
  }

  if (cleanedSession) {
    parts.push(cleanedSession);
  }

  return parts.join(" ").trim();
}

function recordId(studentName: string, rowIndex: number, assessmentYear: string) {
  const cleaned = studentName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `${assessmentYear}-${cleaned || "student"}-${rowIndex + 1}`;
}

function inferAssessmentYear(rows: RawAssessmentRow[], options: ParseAssessmentOptions) {
  const candidates = [
    options.sourceName,
    ...Object.keys(rows[0] ?? {})
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const match = candidate.match(/\b(20\d{2})\b/);

    if (match) {
      return match[1];
    }
  }

  return options.defaultYear ?? "2026";
}

function discoverAssessmentQuarters(rows: RawAssessmentRow[]) {
  const quarters = new Set<AssessmentQuarter>();

  for (const row of rows) {
    for (const header of Object.keys(row)) {
      const normalized = normalizeHeader(header);
      const match = normalized.match(/^(?:20\d{2} )?(?:q([1-9]\d*)|quarter ([1-9]\d*))(?: |$)/);
      const quarter = normalizeAssessmentQuarter(match?.[1] ?? match?.[2] ?? "");

      if (quarter) {
        quarters.add(quarter);
      }
    }
  }

  return Array.from(quarters).sort(compareAssessmentQuarters);
}

function buildQuarterDetail(
  row: RawAssessmentRow,
  quarter: AssessmentQuarter,
  fallback: {
    session: string;
    sessionDay: string;
    sessionPeriod: string;
  }
): QuarterAssessmentDetails | null {
  const coachName = textValue(
    pickQuarterField(
      row,
      quarter,
      buildQuarterHeaders(quarter, quarterFieldNames.coachName),
      quarterFieldNames.coachName
    )
  );
  const centre = textValue(
    pickQuarterField(
      row,
      quarter,
      buildQuarterHeaders(quarter, quarterFieldNames.centre),
      quarterFieldNames.centre
    )
  );
  const level = getQuarterLevelValue(row, quarter);
  const quarterSessionDay = textValue(
    pickQuarterField(
      row,
      quarter,
      buildQuarterHeaders(quarter, quarterFieldNames.sessionDay),
      quarterFieldNames.sessionDay
    )
  );
  const quarterSessionPeriod = textValue(
    pickQuarterField(
      row,
      quarter,
      buildQuarterHeaders(quarter, quarterFieldNames.sessionPeriod),
      quarterFieldNames.sessionPeriod
    )
  );
  const quarterSession = textValue(
    pickQuarterField(
      row,
      quarter,
      buildQuarterHeaders(quarter, quarterFieldNames.session),
      quarterFieldNames.session
    )
  );
  const rawResult = textValue(pickQuarterResult(row, quarter));
  const result = normalizeAssessmentResult(rawResult);
  const hasQuarterData = [
    coachName,
    centre,
    level,
    quarterSessionDay,
    quarterSessionPeriod,
    quarterSession,
    rawResult
  ].some(Boolean);

  if (!hasQuarterData) {
    return null;
  }

  return {
    coachName: coachName || undefined,
    centre: centre || undefined,
    level: level || undefined,
    session:
      combineSessionParts(
        quarterSession || fallback.session,
        quarterSessionDay || fallback.sessionDay,
        quarterSessionPeriod || fallback.sessionPeriod
      ) || undefined,
    result
  };
}

function getQuarterLevelValue(row: RawAssessmentRow, quarter: AssessmentQuarter) {
  return getExactQuarterLevel(row, quarter) || getQuarterClassBandLevel(row, quarter);
}

function getExactQuarterLevel(row: RawAssessmentRow, quarter: AssessmentQuarter) {
  const preferredFieldNames =
    quarter === "Q3"
      ? ["Assessed Level", "Current Level", "Tested Level"]
      : ["Current Level", "Assessed Level", "Tested Level"];
  const value = textValue(
    pickQuarterField(
      row,
      quarter,
      buildQuarterHeaders(quarter, preferredFieldNames),
      preferredFieldNames
    )
  );

  return value && !isClassBandLevel(value) ? value : "";
}

function getQuarterClassBandLevel(row: RawAssessmentRow, quarter: AssessmentQuarter) {
  return textValue(pickQuarterField(row, quarter, [`${quarter} Level`], ["Level"]));
}

function applyExactLevelFallbacks(
  row: RawAssessmentRow,
  quarterDetails: Partial<Record<AssessmentQuarter, QuarterAssessmentDetails>>
) {
  const quarters = Object.keys(quarterDetails).sort(
    (first, second) =>
      compareAssessmentQuarters(first as AssessmentQuarter, second as AssessmentQuarter)
  ) as AssessmentQuarter[];

  for (const quarter of quarters) {
    const detail = quarterDetails[quarter];

    if (!detail || (detail.level && !isClassBandLevel(detail.level))) {
      continue;
    }

    const fallbackLevel = getExactQuarterLevel(row, quarter) || getPreviousExactLevel(row, quarter);

    if (fallbackLevel) {
      detail.level = fallbackLevel;
    }
  }
}

function getPreviousExactLevel(row: RawAssessmentRow, quarter: AssessmentQuarter) {
  const currentQuarterNumber = Number(quarter.replace(/^Q/i, ""));

  for (let quarterNumber = currentQuarterNumber - 1; quarterNumber >= 1; quarterNumber -= 1) {
    const previousQuarter = `Q${quarterNumber}` as AssessmentQuarter;
    const level = getExactQuarterLevel(row, previousQuarter);

    if (level) {
      return level;
    }
  }

  return "";
}

function getLatestQuarterDetail(
  quarterDetails: Partial<Record<AssessmentQuarter, QuarterAssessmentDetails>>
) {
  const quarters = Object.keys(quarterDetails).sort(
    (first, second) =>
      compareAssessmentQuarters(first as AssessmentQuarter, second as AssessmentQuarter)
  ) as AssessmentQuarter[];

  for (let index = quarters.length - 1; index >= 0; index -= 1) {
    const detail = quarterDetails[quarters[index]];

    if (detail) {
      return detail;
    }
  }

  return undefined;
}

export function parseAssessmentRows(
  rows: RawAssessmentRow[],
  options: ParseAssessmentOptions = {}
): StudentAssessmentRecord[] {
  const assessmentYear = inferAssessmentYear(rows, options);
  const discoveredQuarters = discoverAssessmentQuarters(rows);

  return rows
    .map((row, rowIndex) => {
      const studentName = textValue(pickValue(row, aliases.studentName));

      if (!studentName) {
        return null;
      }

      const studentCode = textValue(pickValue(row, aliases.studentCode));
      const originalFlagStatus = textValue(pickValue(row, aliases.flagStatus));
      const originalActionRequired = textValue(pickValue(row, aliases.actionRequired));
      const session = textValue(pickValue(row, aliases.session));
      const sessionDay = textValue(pickValue(row, aliases.sessionDay));
      const sessionPeriod = textValue(pickValue(row, aliases.sessionPeriod));
      const quarterDetails = discoveredQuarters.reduce<
        Partial<Record<AssessmentQuarter, QuarterAssessmentDetails>>
      >((details, quarter) => {
        const detail = buildQuarterDetail(row, quarter, {
          session,
          sessionDay,
          sessionPeriod
        });

        if (detail) {
          details[quarter] = detail;
        }

        return details;
      }, {});
      applyExactLevelFallbacks(row, quarterDetails);
      const latestQuarterDetail = getLatestQuarterDetail(quarterDetails);
      const q1Detail = quarterDetails.Q1;
      const q2Detail = quarterDetails.Q2;
      const coachName =
        textValue(pickValue(row, aliases.coachName)) ||
        latestQuarterDetail?.coachName ||
        "Unassigned";
      const centre =
        textValue(pickValue(row, aliases.centre)) || latestQuarterDetail?.centre || undefined;
      const level =
        latestQuarterDetail?.level || textValue(pickValue(row, aliases.level)) || undefined;
      const combinedSession =
        combineSessionParts(session, sessionDay, sessionPeriod) ||
        latestQuarterDetail?.session ||
        undefined;

      return applyAssessmentLogic({
        id: recordId(studentName, rowIndex, assessmentYear),
        studentCode: studentCode || undefined,
        studentName,
        coachName,
        centre,
        level,
        session: combinedSession,
        assessmentYear,
        q1CoachName: q1Detail?.coachName,
        q1Centre: q1Detail?.centre,
        q1Level: q1Detail?.level,
        q1Session: q1Detail?.session,
        q1Result: q1Detail?.result ?? "",
        q2CoachName: q2Detail?.coachName,
        q2Centre: q2Detail?.centre,
        q2Level: q2Detail?.level,
        q2Session: q2Detail?.session,
        q2Result: q2Detail?.result ?? "",
        quarterDetails,
        sourceRow: rowIndex + 2,
        originalFlagStatus: originalFlagStatus || undefined,
        originalActionRequired: originalActionRequired || undefined
      });
    })
    .filter((record): record is StudentAssessmentRecord => Boolean(record));
}

export function parseCsvText(
  csvText: string,
  options: ParseAssessmentOptions = {}
): StudentAssessmentRecord[] {
  const parsed = Papa.parse<RawAssessmentRow>(csvText.replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.replace(/\uFEFF/g, "").trim()
  });

  return parseAssessmentRows(parsed.data, options);
}

export async function parseUploadFile(file: File): Promise<ParsedUploadResult> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  let rows: RawAssessmentRow[] = [];

  if (extension === "xlsx" || extension === "xls") {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      throw new Error("No worksheet found in the uploaded file.");
    }

    rows = XLSX.utils.sheet_to_json<RawAssessmentRow>(workbook.Sheets[firstSheetName], {
      defval: ""
    });
  } else {
    const text = await file.text();
    const parsed = Papa.parse<RawAssessmentRow>(text.replace(/^\uFEFF/, ""), {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.replace(/\uFEFF/g, "").trim()
    });

    if (parsed.errors.length > 0) {
      throw new Error(parsed.errors[0]?.message ?? "Unable to parse the CSV file.");
    }

    rows = parsed.data;
  }

  const records = parseAssessmentRows(rows, {
    defaultYear: "2026",
    sourceName: file.name
  });

  if (records.length === 0) {
    throw new Error("No student rows were found in the uploaded file.");
  }

  return {
    records,
    fileName: file.name,
    rowCount: rows.length
  };
}
