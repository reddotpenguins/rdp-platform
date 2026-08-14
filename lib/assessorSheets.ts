export type AssessorSheetClassType = "Regular" | "Make Up";

export type AssessorSheetRow = {
  id: string;
  sessionTime: string;
  sessionDay: string;
  location: string;
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
  days: string[];
  locations: string[];
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

const levelSearchPattern =
  /\b(Baby\s+Class|Toddler|Foundation|Intermediate|Mini\s+Squad|Race\s+Team|Squad|Learn\s+to\s+Swim|Social\s+Swim\s+Club)\s*(\([^)]*\))?/gi;

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
    const classTexts = getRegularClassTexts(eventName);
    const lookup = assessmentLookup.get(normalizeStudentKey(studentName));

    classTexts.forEach((classText, classIndex) => {
      const sessionTime = getSessionFromRegularRow(row, classText);

      rows.push({
        id: `regular-${index}-${classIndex}-${normalizeStudentKey(studentName) || "student"}`,
        sessionTime,
        sessionDay: parseDayFromSessionLabel(sessionTime),
        location:
          parseLocationFromClassText(classText) ||
          textValue(getValue(row, ["Class Centre", "Centre", "Center", "Location"])),
        studentName,
        instructorName: getInstructorFromRegularRow(row, lookup, classIndex, classTexts.length),
        classType: "Regular",
        currentLevel: getCurrentLevelFromRegularRow(row, lookup, classText),
        passFail: ""
      });
    });
  });

  makeUpRows.forEach((row, index) => {
    const studentName = normalizeStudentNameForDisplay(getValue(row, ["Student", "Student Name"]));

    if (!studentName) {
      return;
    }

    const className = textValue(getValue(row, ["Class Name", "Event Name"]));
    const classSchedule = textValue(getValue(row, ["Class Schedule", "Session", "Session Time"]));
    const sessionTime = normalizeSessionLabel(classSchedule) || parseSessionFromClassText(className);

    rows.push({
      id: `make-up-${index}-${normalizeStudentKey(studentName) || "student"}`,
      sessionTime,
      sessionDay: parseDayFromSessionLabel(sessionTime),
      location:
        parseLocationFromClassText(className) ||
        textValue(getValue(row, ["Centre", "Center", "Location"])),
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
  const days = Array.from(
    new Set(rows.map((row) => row.sessionDay).filter((day) => day.trim() !== ""))
  ).sort(compareDayLabels);
  const locations = Array.from(
    new Set(rows.map((row) => row.location).filter((location) => location.trim() !== ""))
  ).sort((first, second) => first.localeCompare(second, undefined, { sensitivity: "base" }));
  const sessions = Array.from(
    new Set(rows.map((row) => row.sessionTime).filter((session) => session.trim() !== ""))
  ).sort(compareSessionLabels);

  return {
    totalRows: rows.length,
    regularRows: rows.filter((row) => row.classType === "Regular").length,
    makeUpRows: rows.filter((row) => row.classType === "Make Up").length,
    missingInstructorRows: rows.filter((row) => row.instructorName.trim() === "").length,
    missingSessionRows: rows.filter((row) => row.sessionTime.trim() === "").length,
    days,
    locations,
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

function getRegularClassTexts(eventName: string) {
  const classTexts = splitClassTextsFromEventName(eventName);

  return classTexts.length > 0 ? classTexts : [""];
}

export function splitClassTextsFromEventName(value: unknown) {
  const text = textValue(value);

  if (!text) {
    return [];
  }

  const sessionPattern =
    /\b(?:mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday|rday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\s*:?\s+\d{1,2}:\d{2}\s*(?:am|pm)?\s*(?:-|to)\s*\d{1,2}:\d{2}\s*(?:am|pm)?\b/gi;
  const matches = Array.from(text.matchAll(sessionPattern));

  if (matches.length <= 1) {
    return [text];
  }

  return matches
    .map((match, index) => {
      const start =
        index === 0
          ? 0
          : (matches[index - 1].index ?? 0) + matches[index - 1][0].length;
      const end = (match.index ?? text.length) + match[0].length;

      return text.slice(start, end).replace(/^,\s*/, "").trim();
    })
    .filter(Boolean);
}

function getSessionFromRegularRow(row: RawSheetRow, classText: string) {
  return (
    normalizeSessionLabel(
      getValue(row, [
        "Current Class Session",
        "Session",
        "Session Time",
        "Q3 Session",
        "Q2 Session",
        "Q1 Session",
        "Class Schedule"
      ])
    ) || parseSessionFromClassText(classText)
  );
}

function getInstructorFromRegularRow(
  row: RawSheetRow,
  lookup: AssessmentLookupValue | undefined,
  classIndex: number,
  classCount: number
) {
  const instructorNames = getInstructorNamesFromRegularRow(row);

  if (instructorNames.length === classCount) {
    return instructorNames[classIndex] ?? "";
  }

  if (instructorNames.length === 1) {
    return instructorNames[0];
  }

  if (instructorNames.length > 1) {
    return instructorNames[classIndex] ?? instructorNames.join(", ");
  }

  return lookup?.instructorName ?? "";
}

function getInstructorNamesFromRegularRow(row: RawSheetRow) {
  return parseInstructorNames(
    getValue(row, [
      "Instructors",
      "Instructor",
      "Current Coach",
      "Q3 Coach",
      "Q2 Coach",
      "Q1 Coach",
      "Coach"
    ])
  );
}

function getCurrentLevelFromRegularRow(
  row: RawSheetRow,
  lookup: AssessmentLookupValue | undefined,
  classText: string
) {
  return lookup?.currentLevel || getLevelFromRegularRow(row) || parseLevelFromClassText(classText);
}

function getLevelFromRegularRow(row: RawSheetRow) {
  return textValue(
    getValue(row, [
      "Current Level",
      "Q3 Current Level",
      "Q2 Current Level",
      "Q1 Current Level",
      "Q3 Assessed Level",
      "Q3 Tested Level",
      "Q2 Assessed Level",
      "Q2 Tested Level",
      "Q1 Assessed Level",
      "Q1 Tested Level",
      "Current Class Level",
      "Q3 Level",
      "Q2 Level",
      "Q1 Level",
      "Level"
    ])
  );
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
  const match = findLastLevelMatch(textValue(value));

  if (!match) {
    return "";
  }

  return `${toTitleCase(match[1])}${match[2] ? ` ${match[2].trim()}` : ""}`.trim();
}

export function parseLocationFromClassText(value: unknown) {
  const text = textValue(value);

  if (!text) {
    return "";
  }

  const withoutSession = text
    .replace(
      /\s+-\s+\b(?:mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday|rday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\s*:?\s+\d{1,2}:\d{2}.*$/i,
      ""
    )
    .trim();
  const levelMatch = findLastLevelMatch(withoutSession);
  const location = levelMatch
    ? withoutSession.slice(0, levelMatch.index).trim()
    : withoutSession.trim();

  return location.replace(/^Fundamental\s+Squad,\s*/i, "").replace(/\s+/g, " ");
}

export function parseDayFromSessionLabel(value: unknown) {
  const match = textValue(value).match(/^([A-Za-z]+)/);

  return match ? normalizeDayLabel(match[1]) : "";
}

export function formatInstructorNames(value: unknown) {
  return parseInstructorNames(value).join(", ");
}

function parseInstructorNames(value: unknown): string[] {
  const text = textValue(value);

  if (!text) {
    return [];
  }

  const groupedParts = text
    .split(/\s*(?:;|\|)\s*/)
    .map((name) => name.trim())
    .filter(Boolean);

  if (groupedParts.length > 1) {
    return groupedParts.flatMap(parseInstructorNames);
  }

  const commaParts = text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (commaParts.length >= 2) {
    const names: string[] = [];

    for (let index = 0; index < commaParts.length; index += 2) {
      const surname = commaParts[index];
      const givenName = commaParts[index + 1];

      names.push(givenName ? `${givenName} ${surname}`.trim() : surname);
    }

    return names.filter(Boolean);
  }

  return [formatCommaName(text)].filter(Boolean);
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
    const currentLevel = getSpecificAssessmentLevel(row);

    lookup.set(studentKey, {
      instructorName,
      currentLevel
    });
  }

  return lookup;
}

function getSpecificAssessmentLevel(row: RawSheetRow) {
  const lookup = rowLookup(row);
  const candidateHeaders = [
    "Current Level",
    "Q3 Current Level",
    "Q2 Current Level",
    "Q1 Current Level",
    "Q3 Assessed Level",
    "Q3 Tested Level",
    "Q2 Assessed Level",
    "Q2 Tested Level",
    "Q1 Assessed Level",
    "Q1 Tested Level",
    "Q3 Level",
    "Q2 Level",
    "Q1 Level",
    "Level"
  ];

  for (const header of candidateHeaders) {
    const value = textValue(lookup.get(normalizeHeader(header)));

    if (value && !isClassBandLevel(value)) {
      return value;
    }
  }

  return "";
}

function compareAssessorRows(first: AssessorSheetRow, second: AssessorSheetRow) {
  return (
    compareSessionLabels(first.sessionTime, second.sessionTime) ||
    first.location.localeCompare(second.location, undefined, { sensitivity: "base" }) ||
    first.instructorName.localeCompare(second.instructorName, undefined, { sensitivity: "base" }) ||
    first.classType.localeCompare(second.classType, undefined, { sensitivity: "base" }) ||
    first.studentName.localeCompare(second.studentName, undefined, { sensitivity: "base" })
  );
}

function compareDayLabels(first: string, second: string) {
  const firstDay = dayOrder.get(first.toLowerCase()) ?? 99;
  const secondDay = dayOrder.get(second.toLowerCase()) ?? 99;

  return firstDay - secondDay || first.localeCompare(second, undefined, { sensitivity: "base" });
}

function compareSessionLabels(first: string, second: string) {
  const firstParts = getSessionSortParts(first);
  const secondParts = getSessionSortParts(second);

  return (
    firstParts.day - secondParts.day ||
    firstParts.period - secondParts.period ||
    firstParts.startMinutes - secondParts.startMinutes ||
    first.localeCompare(second, undefined, { numeric: true, sensitivity: "base" })
  );
}

function getSessionSortParts(value: string) {
  const cleaned = value.trim();
  const dayMatch = cleaned.match(/^([A-Za-z]+)/);
  const timeMatch = cleaned.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  const day = dayOrder.get((dayMatch?.[1] ?? "").toLowerCase()) ?? 99;
  let periodOrder = 99;
  let startMinutes = 24 * 60;

  if (timeMatch) {
    const hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    const period = timeMatch[3]?.toUpperCase() ?? inferStartPeriod(hour);
    periodOrder = period === "AM" ? 0 : period === "PM" ? 1 : 99;
    const normalizedHour =
      period === "PM" && hour < 12 ? hour + 12 : period === "AM" && hour === 12 ? 0 : hour;
    startMinutes = normalizedHour * 60 + minute;
  }

  return { day, period: periodOrder, startMinutes };
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

function findLastLevelMatch(value: string) {
  return Array.from(value.matchAll(levelSearchPattern)).at(-1);
}

function isClassBandLevel(value: unknown) {
  return /^(baby class|toddler|foundation|intermediate|mini squad|race team|squad|learn to swim|social swim club)(?:\s*\([^)]*\))?$/i.test(
    textValue(value)
  );
}

function textValue(value: unknown) {
  return String(value ?? "").replace(/\uFEFF/g, "").trim();
}
