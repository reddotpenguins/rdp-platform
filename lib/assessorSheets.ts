export type AssessorSheetClassType = "Regular" | "Make Up";

export type AssessorSheetRow = {
  id: string;
  sessionTime: string;
  studentName: string;
  instructorName: string;
  classType: AssessorSheetClassType;
  currentLevel: string;
  passFail: string;
};

export type AssessorSheetSummary = {
  totalRows: number;
  regularRows: number;
  makeUpRows: number;
  missingInstructorRows: number;
  missingSessionRows: number;
  sessions: string[];
};

type RawSheetRow = Record<string, unknown>;

type AssessmentLookupValue = {
  instructorName: string;
  currentLevel: string;
};

const dayOrder = new Map([
  ["mon", 1],
  ["monday", 1],
  ["tue", 2],
  ["tues", 2],
  ["tuesday", 2],
  ["wed", 3],
  ["wednesday", 3],
  ["thu", 4],
  ["thur", 4],
  ["thurs", 4],
  ["thursday", 4],
  ["fri", 5],
  ["friday", 5],
  ["sat", 6],
  ["saturday", 6],
  ["sun", 7],
  ["sunday", 7]
]);

const levelPattern =
  /\b(Baby\s+Class|Toddler|Foundation|Intermediate|Mini\s+Squad|Race\s+Team|Squad|Learn\s+to\s+Swim|Social\s+Swim\s+Club)\s*(\([^)]*\))?/i;

export function buildAssessorSheetRows({
  assessmentRows,
  makeUpRows,
  regularRows
}: {
  assessmentRows: RawSheetRow[];
  regularRows: RawSheetRow[];
  makeUpRows: RawSheetRow[];
}) {
  const assessmentLookup = buildAssessmentLookup(assessmentRows);
  const rows: AssessorSheetRow[] = [];

  regularRows.forEach((row, index) => {
    const studentName = normalizeStudentNameForDisplay(
      getValue(row, ["Student Name", "Student", "Name"])
    );

    if (!studentName) {
      return;
    }

    const eventName = textValue(getValue(row, ["Event Name", "Class Name", "Programme"]));
    const lookup = assessmentLookup.get(normalizeStudentKey(studentName));

    rows.push({
      id: `regular-${index}-${normalizeStudentKey(studentName) || "student"}`,
      sessionTime: parseSessionFromClassText(eventName),
      studentName,
      instructorName: lookup?.instructorName ?? "",
      classType: "Regular",
      currentLevel: parseLevelFromClassText(eventName) || lookup?.currentLevel || "",
      passFail: ""
    });
  });

  makeUpRows.forEach((row, index) => {
    const studentName = normalizeStudentNameForDisplay(getValue(row, ["Student", "Student Name"]));

    if (!studentName) {
      return;
    }

    const className = textValue(getValue(row, ["Class Name", "Event Name"]));
    const classSchedule = textValue(getValue(row, ["Class Schedule", "Session", "Session Time"]));

    rows.push({
      id: `make-up-${index}-${normalizeStudentKey(studentName) || "student"}`,
      sessionTime: normalizeSessionLabel(classSchedule) || parseSessionFromClassText(className),
      studentName,
      instructorName: formatInstructorNames(textValue(getValue(row, ["Instructors", "Instructor"]))),
      classType: "Make Up",
      currentLevel: parseLevelFromClassText(className),
      passFail: ""
    });
  });

  return rows.sort(compareAssessorRows);
}

export function getAssessorSheetSummary(rows: AssessorSheetRow[]): AssessorSheetSummary {
  const sessions = Array.from(
    new Set(rows.map((row) => row.sessionTime).filter((session) => session.trim() !== ""))
  ).sort(compareSessionLabels);

  return {
    totalRows: rows.length,
    regularRows: rows.filter((row) => row.classType === "Regular").length,
    makeUpRows: rows.filter((row) => row.classType === "Make Up").length,
    missingInstructorRows: rows.filter((row) => row.instructorName.trim() === "").length,
    missingSessionRows: rows.filter((row) => row.sessionTime.trim() === "").length,
    sessions
  };
}

export function getAssessorSheetColumns() {
  return [
    { header: "Session Time", value: (row: AssessorSheetRow) => row.sessionTime },
    { header: "Name of Student", value: (row: AssessorSheetRow) => row.studentName },
    { header: "Name of Instructor", value: (row: AssessorSheetRow) => row.instructorName },
    { header: "Class Type", value: (row: AssessorSheetRow) => row.classType },
    { header: "Current Level", value: (row: AssessorSheetRow) => row.currentLevel },
    { header: "Pass/Fail", value: (row: AssessorSheetRow) => row.passFail }
  ];
}

export function normalizeStudentNameForDisplay(value: unknown) {
  const cleaned = textValue(value).replace(/\s+/g, " ");

  if (!cleaned) {
    return "";
  }

  const commaParts = cleaned
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (commaParts.length >= 2 && commaParts[0] === "-") {
    return commaParts.slice(1).join(" ");
  }

  if (commaParts.length >= 2 && commaParts[0].length > 1) {
    return `${commaParts.slice(1).join(" ")} ${commaParts[0]}`.trim();
  }

  return cleaned.replace(/^-\s*,?\s*/, "").trim();
}

export function normalizeStudentKey(value: unknown) {
  return normalizeStudentNameForDisplay(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function parseSessionFromClassText(value: unknown) {
  const text = textValue(value);

  if (!text) {
    return "";
  }

  const scheduledSegment = text.match(
    /\b(mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday|rday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\s*:?\s+\d{1,2}:\d{2}\s*(?:am|pm)?\s*(?:-|to)\s*\d{1,2}:\d{2}\s*(?:am|pm)?\b/i
  );

  return normalizeSessionLabel(scheduledSegment?.[0] ?? "");
}

export function normalizeSessionLabel(value: unknown) {
  const cleaned = textValue(value)
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return "";
  }

  const schedule = cleaned.match(
    /^\s*([A-Za-z]+)\s*[-:]?\s*(\d{1,2}):(\d{2})\s*(AM|PM)?\s*(?:-|to)\s*(\d{1,2}):(\d{2})\s*(AM|PM)?\s*$/i
  );

  if (schedule) {
    const start = normalizeClockTime({
      hour: Number(schedule[2]),
      minute: schedule[3],
      period: schedule[4]
    });
    const end = normalizeClockTime({
      hour: Number(schedule[5]),
      minute: schedule[6],
      period: schedule[7],
      startPeriod: start.period
    });

    return `${normalizeDayLabel(schedule[1])} ${start.label} - ${end.label}`;
  }

  return cleaned
    .replace(/^([A-Za-z]+):\s*/, (_match, day: string) => `${normalizeDayLabel(day)} `)
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseLevelFromClassText(value: unknown) {
  const match = textValue(value).match(levelPattern);

  if (!match) {
    return "";
  }

  return `${toTitleCase(match[1])}${match[2] ? ` ${match[2].trim()}` : ""}`.trim();
}

export function formatInstructorNames(value: unknown) {
  const text = textValue(value);

  if (!text) {
    return "";
  }

  return text
    .split(/\s*(?:;|\|)\s*/)
    .map((name) => formatCommaName(name))
    .filter(Boolean)
    .join(", ");
}

function buildAssessmentLookup(rows: RawSheetRow[]) {
  const lookup = new Map<string, AssessmentLookupValue>();

  for (const row of rows) {
    const studentName = normalizeStudentNameForDisplay(
      getValue(row, ["Student Name", "Student", "Name"])
    );
    const studentKey = normalizeStudentKey(studentName);

    if (!studentKey || lookup.has(studentKey)) {
      continue;
    }

    const instructorName = textValue(
      getValue(row, ["Current Coach", "Q3 Coach", "Q2 Coach", "Q1 Coach", "Coach", "Instructor"])
    );
    const currentLevel = textValue(
      getValue(row, [
        "Current Level",
        "Level",
        "Q3 Current Level",
        "Q3 Level",
        "Q2 Current Level",
        "Q2 Level",
        "Q1 Current Level",
        "Q1 Level"
      ])
    );

    lookup.set(studentKey, {
      instructorName,
      currentLevel
    });
  }

  return lookup;
}

function compareAssessorRows(first: AssessorSheetRow, second: AssessorSheetRow) {
  return (
    compareSessionLabels(first.sessionTime, second.sessionTime) ||
    first.instructorName.localeCompare(second.instructorName, undefined, { sensitivity: "base" }) ||
    first.classType.localeCompare(second.classType, undefined, { sensitivity: "base" }) ||
    first.studentName.localeCompare(second.studentName, undefined, { sensitivity: "base" })
  );
}

function compareSessionLabels(first: string, second: string) {
  const firstParts = getSessionSortParts(first);
  const secondParts = getSessionSortParts(second);

  return (
    firstParts.day - secondParts.day ||
    firstParts.startMinutes - secondParts.startMinutes ||
    first.localeCompare(second, undefined, { numeric: true, sensitivity: "base" })
  );
}

function getSessionSortParts(value: string) {
  const cleaned = value.trim();
  const dayMatch = cleaned.match(/^([A-Za-z]+)/);
  const timeMatch = cleaned.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  const day = dayOrder.get((dayMatch?.[1] ?? "").toLowerCase()) ?? 99;
  let startMinutes = 24 * 60;

  if (timeMatch) {
    const hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    const period = timeMatch[3]?.toUpperCase() ?? inferStartPeriod(hour);
    const normalizedHour =
      period === "PM" && hour < 12 ? hour + 12 : period === "AM" && hour === 12 ? 0 : hour;
    startMinutes = normalizedHour * 60 + minute;
  }

  return { day, startMinutes };
}

function getValue(row: RawSheetRow, candidateHeaders: string[]) {
  const lookup = rowLookup(row);

  for (const header of candidateHeaders) {
    const value = lookup.get(normalizeHeader(header));

    if (textValue(value) !== "") {
      return value;
    }
  }

  return "";
}

function rowLookup(row: RawSheetRow) {
  const lookup = new Map<string, unknown>();

  for (const [key, value] of Object.entries(row)) {
    lookup.set(normalizeHeader(key), value);
  }

  return lookup;
}

function normalizeHeader(header: string) {
  return header
    .replace(/\uFEFF/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeDayLabel(value: string) {
  const key = value.toLowerCase();

  if (key.startsWith("mon")) return "Mon";
  if (key.startsWith("tue")) return "Tue";
  if (key.startsWith("wed")) return "Wed";
  if (key.startsWith("thu")) return "Thu";
  if (key.startsWith("fri")) return "Fri";
  if (key.startsWith("sat")) return "Sat";
  if (key.startsWith("sun")) return "Sun";

  return value;
}

function normalizeClockTime({
  hour,
  minute,
  period,
  startPeriod
}: {
  hour: number;
  minute: string;
  period?: string;
  startPeriod?: string;
}) {
  const normalizedPeriod = (period?.toUpperCase() || inferEndPeriod(hour, startPeriod)) as
    | "AM"
    | "PM";

  return {
    label: `${hour}:${minute}${normalizedPeriod}`,
    period: normalizedPeriod
  };
}

function inferEndPeriod(hour: number, startPeriod?: string) {
  if (!startPeriod) {
    return inferStartPeriod(hour);
  }

  if (startPeriod === "AM" && hour === 12) {
    return "PM";
  }

  return startPeriod;
}

function inferStartPeriod(hour: number) {
  if (hour === 12 || hour <= 7) {
    return "PM";
  }

  return "AM";
}

function formatCommaName(value: string) {
  const cleaned = value.trim();
  const parts = cleaned
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 2) {
    return `${parts[1]} ${parts[0]}`.trim();
  }

  return cleaned;
}

function toTitleCase(value: string) {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .replace(/\bLts\b/g, "LTS");
}

function textValue(value: unknown) {
  return String(value ?? "").replace(/\uFEFF/g, "").trim();
}
