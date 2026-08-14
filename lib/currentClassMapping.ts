import {
  normalizeStudentKey,
  normalizeStudentNameForDisplay,
  parseLevelFromClassText,
  parseSessionFromClassText
} from "./assessorSheets.ts";

type RawSheetRow = Record<string, unknown>;

export type CurrentClassMapping = {
  studentName: string;
  studentKey: string;
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
    const session = parseSessionFromClassText(eventName);
    const level = parseLevelFromClassText(eventName);

    if (!studentName || !studentKey || (!session && !level)) {
      continue;
    }

    if (!mappings.has(studentKey)) {
      mappings.set(studentKey, {
        studentName,
        studentKey,
        session,
        level,
        eventName
      });
    }
  }

  return Array.from(mappings.values()).sort((first, second) =>
    first.studentName.localeCompare(second.studentName, undefined, { sensitivity: "base" })
  );
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
