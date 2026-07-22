import Papa from "papaparse";
import { applyAssessmentLogic, normalizeAssessmentResult } from "@/lib/assessmentLogic";
import type { StudentAssessmentRecord } from "@/types/assessment";

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
  studentName: ["Student Name", "Name", "Student"],
  coachName: ["Current Coach", "Coach", "Coach Name"],
  q1CoachName: ["Q1 Coach", "2026 Q1 Coach", "Q1 Coach Name"],
  q2CoachName: ["Q2 Coach", "2026 Q2 Coach", "Q2 Coach Name"],
  centre: ["Centre", "Center", "Location", "Current Centre"],
  q1Centre: ["Q1 Centre", "Q1 Center", "2026 Q1 Centre", "2026 Q1 Center"],
  q2Centre: ["Q2 Centre", "Q2 Center", "2026 Q2 Centre", "2026 Q2 Center"],
  level: ["Level", "Current Level"],
  q1Level: ["Q1 Current Level", "Q1 Level", "2026 Q1 Current Level", "2026 Q1 Level"],
  q2Level: ["Q2 Current Level", "Q2 Level", "2026 Q2 Current Level", "2026 Q2 Level"],
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
  q1Session: [
    "Q1 Session",
    "Q1 Session Time",
    "Q1 Class Time",
    "Q1 Lesson Time",
    "Q1 Time",
    "2026 Q1 Session",
    "2026 Q1 Session Time"
  ],
  q2Session: [
    "Q2 Session",
    "Q2 Session Time",
    "Q2 Class Time",
    "Q2 Lesson Time",
    "Q2 Time",
    "2026 Q2 Session",
    "2026 Q2 Session Time"
  ],
  q1Result: ["Q1 Result", "2026 Q1", "Q1"],
  q2Result: ["Q2 Result", "2026 Q2", "Q2"],
  flagStatus: ["Flag Status", "Flag"],
  actionRequired: ["Action Required", "Action"]
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

function pickQuarterResult(row: RawAssessmentRow, quarter: "Q1" | "Q2") {
  const fallback = pickValue(row, aliases[quarter === "Q1" ? "q1Result" : "q2Result"]);

  if (String(fallback ?? "").trim() !== "") {
    return fallback;
  }

  const quarterNumber = quarter === "Q1" ? "1" : "2";

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
  quarter: "Q1" | "Q2",
  fallbackHeaders: string[],
  fieldNames: string[]
) {
  const fallback = pickValue(row, fallbackHeaders);

  if (String(fallback ?? "").trim() !== "") {
    return fallback;
  }

  const quarterNumber = quarter === "Q1" ? "1" : "2";
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

function textValue(value: unknown) {
  return String(value ?? "").replace(/\uFEFF/g, "").trim();
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

export function parseAssessmentRows(
  rows: RawAssessmentRow[],
  options: ParseAssessmentOptions = {}
): StudentAssessmentRecord[] {
  const assessmentYear = inferAssessmentYear(rows, options);

  return rows
    .map((row, rowIndex) => {
      const studentName = textValue(pickValue(row, aliases.studentName));

      if (!studentName) {
        return null;
      }

      const originalFlagStatus = textValue(pickValue(row, aliases.flagStatus));
      const originalActionRequired = textValue(pickValue(row, aliases.actionRequired));
      const q1CoachName = textValue(
        pickQuarterField(row, "Q1", aliases.q1CoachName, ["Coach", "Coach Name"])
      );
      const q2CoachName = textValue(
        pickQuarterField(row, "Q2", aliases.q2CoachName, ["Coach", "Coach Name"])
      );
      const q1Centre = textValue(
        pickQuarterField(row, "Q1", aliases.q1Centre, ["Centre", "Center", "Location"])
      );
      const q2Centre = textValue(
        pickQuarterField(row, "Q2", aliases.q2Centre, ["Centre", "Center", "Location"])
      );
      const q1Level = textValue(
        pickQuarterField(row, "Q1", aliases.q1Level, ["Level", "Current Level"])
      );
      const q2Level = textValue(
        pickQuarterField(row, "Q2", aliases.q2Level, ["Level", "Current Level"])
      );
      const session = textValue(pickValue(row, aliases.session));
      const q1Session = textValue(
        pickQuarterField(row, "Q1", aliases.q1Session, [
          "Session",
          "Session Time",
          "Class Time",
          "Lesson Time",
          "Time",
          "Timing",
          "Time Slot"
        ])
      );
      const q2Session = textValue(
        pickQuarterField(row, "Q2", aliases.q2Session, [
          "Session",
          "Session Time",
          "Class Time",
          "Lesson Time",
          "Time",
          "Timing",
          "Time Slot"
        ])
      );
      const coachName =
        textValue(pickValue(row, aliases.coachName)) || q2CoachName || q1CoachName || "Unassigned";
      const centre = textValue(pickValue(row, aliases.centre)) || q2Centre || q1Centre || undefined;
      const level = textValue(pickValue(row, aliases.level)) || q2Level || q1Level || undefined;

      return applyAssessmentLogic({
        id: recordId(studentName, rowIndex, assessmentYear),
        studentName,
        coachName,
        centre,
        level,
        session: session || undefined,
        assessmentYear,
        q1CoachName: q1CoachName || coachName,
        q1Centre: q1Centre || centre,
        q1Level: q1Level || level,
        q1Session: q1Session || session || undefined,
        q1Result: normalizeAssessmentResult(pickQuarterResult(row, "Q1")),
        q2CoachName: q2CoachName || coachName,
        q2Centre: q2Centre || centre,
        q2Level: q2Level || level,
        q2Session: q2Session || session || undefined,
        q2Result: normalizeAssessmentResult(pickQuarterResult(row, "Q2")),
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
