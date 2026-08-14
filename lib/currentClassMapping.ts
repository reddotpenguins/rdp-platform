import {
  normalizeStudentKey,
  normalizeStudentNameForDisplay,
  parseLevelFromClassText,
  parseLocationFromClassText,
  parseSessionFromClassText,
  splitClassTextsFromEventName
} from "./assessorSheets.ts";

type RawSheetRow = Record<string, unknown>;

export type CurrentClassMapping = {
  studentName: string;
  studentKey: string;
  centreName: string;
  session: string;
  level: string;
  eventName: string;
};

export function parseCurrentClassMappings(rows: RawSheetRow[]) {
  const mappings = new Map<string, CurrentClassMapping>();

  for (const row of rows) {
    const studentName = normalizeStudentNameForDisplay(
      getValue(row, ["Student Name", "Student", "Name"])
    );
    const studentKey = normalizeStudentKey(studentName);
    const eventName = textValue(getValue(row, ["Event Name", "Class Name", "Programme"]));
    const firstClassText = splitClassTextsFromEventName(eventName)[0] ?? eventName;
    const centreName = getCentreNameFromRegularRow(row, firstClassText);
    const session = parseSessionFromClassText(firstClassText);
    const level = parseLevelFromClassText(firstClassText);

    if (!studentName || !studentKey || (!session && !level)) {
      continue;
    }

    if (!mappings.has(studentKey)) {
      mappings.set(studentKey, {
        studentName,
        studentKey,
        centreName,
        session,
        level,
        eventName: firstClassText
      });
    }
  }

  return Array.from(mappings.values()).sort((first, second) =>
    first.studentName.localeCompare(second.studentName, undefined, { sensitivity: "base" })
  );
}

function getCentreNameFromRegularRow(row: RawSheetRow, eventName: string) {
  const directCentre = textValue(
    getValue(row, ["Centre", "Center", "Class Centre", "Location", "Venue"])
  );

  if (directCentre) {
    return normalizeCentreName(directCentre);
  }

  const location = parseLocationFromClassText(eventName);

  return normalizeCentreName(location);
}

function normalizeCentreName(value: string) {
  const cleaned = value.replace(/^Fundamental\s+Squad,\s*/i, "").replace(/\s+/g, " ").trim();

  if (!cleaned) {
    return "";
  }

  const centre = cleaned.split("@")[0]?.trim() ?? cleaned;

  return centre.replace(/\s+/g, " ");
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

function textValue(value: unknown) {
  return String(value ?? "").replace(/\uFEFF/g, "").trim();
}
