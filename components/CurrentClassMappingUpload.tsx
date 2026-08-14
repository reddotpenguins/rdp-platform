"use client";

import { ChangeEvent, DragEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { CalendarDays, CheckCircle2, Upload } from "lucide-react";
import { getSessionDay } from "@/lib/assessmentLogic";
import {
  parseCurrentClassMappings
} from "@/lib/currentClassMapping";
import { normalizeStudentKey } from "@/lib/assessorSheets";
import { createClient } from "@/lib/supabase/client";

type RawSheetRow = Record<string, unknown>;

type AssessmentImportMappingRow = {
  id: string;
  student_name: string;
  centre_name: string | null;
  level: string | null;
  session_label: string | null;
};

type ApplyResult = {
  mappedStudents: number;
  matchedRows: number;
  updatedRows: number;
  clearedStaleRows: number;
  unmatchedRows: number;
};

const pageSize = 1000;

export function CurrentClassMappingUpload() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);

  async function applyCurrentClassMapping() {
    if (!file) {
      setError("Choose the current regular student list first.");
      return;
    }

    setIsApplying(true);
    setError(null);
    setResult(null);

    try {
      const rawRows = await readSheetFile(file);
      const mappings = parseCurrentClassMappings(rawRows);

      if (mappings.length === 0) {
        throw new Error("No current class rows were found in the selected file.");
      }

      const supabase = createClient();
      const assessmentRows = await fetchAssessmentImportRows(supabase);
      const mappingByStudent = new Map(mappings.map((mapping) => [mapping.studentKey, mapping]));
      const mappedDays = new Set(
        mappings.map((mapping) => getSessionDay(mapping.session)).filter(Boolean)
      );
      let matchedRows = 0;
      let updatedRows = 0;
      let clearedStaleRows = 0;

      for (const chunk of chunkRows(assessmentRows, 25)) {
        const chunkResults = await Promise.all(
          chunk.map(async (row) => {
            const mapping = mappingByStudent.get(normalizeStudentKey(row.student_name));

            if (mapping) {
              matchedRows += 1;
              const nextCentre = mapping.centreName || row.centre_name;
              const nextLevel = mapping.level || row.level;
              const nextSession = mapping.session || row.session_label;

              if (
                nextCentre === row.centre_name &&
                nextLevel === row.level &&
                nextSession === row.session_label
              ) {
                return "skipped" as const;
              }

              await updateAssessmentImportRow(supabase, row.id, {
                centre_name: nextCentre,
                level: nextLevel,
                session_label: nextSession
              });
              return "updated" as const;
            }

            if (shouldClearStaleAssessedDay(row.session_label, mappedDays)) {
              await updateAssessmentImportRow(supabase, row.id, {
                centre_name: row.centre_name,
                level: row.level,
                session_label: null
              });
              return "cleared" as const;
            }

            return "skipped" as const;
          })
        );

        updatedRows += chunkResults.filter((status) => status === "updated").length;
        clearedStaleRows += chunkResults.filter((status) => status === "cleared").length;
      }

      setResult({
        mappedStudents: mappings.length,
        matchedRows,
        updatedRows,
        clearedStaleRows,
        unmatchedRows: assessmentRows.length - matchedRows
      });
      router.refresh();
    } catch (applyError) {
      setError(
        applyError instanceof Error
          ? applyError.message
          : "Unable to apply the current class mapping."
      );
    } finally {
      setIsApplying(false);
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] ?? null);
  }

  function setSelectedFile(nextFile: File | null) {
    setFile(nextFile);
    setError(null);
    setResult(null);
  }

  function onDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (!isApplying) {
      setIsDragging(true);
    }
  }

  function onDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    if (!isApplying) {
      setSelectedFile(event.dataTransfer.files?.[0] ?? null);
    }
  }

  return (
    <section className="rounded-lg border border-line bg-paper p-5 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-lg bg-teal/10 text-teal">
            <CalendarDays aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 className="text-xl font-semibold text-ink">Update current class data</h2>
            <p className="text-sm text-slate-500">
              Use the regular student list to update dashboard session days and current levels.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void applyCurrentClassMapping()}
          disabled={isApplying}
          className="inline-flex h-10 items-center rounded-md bg-teal px-4 text-sm font-semibold text-white transition hover:bg-teal/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isApplying ? "Updating..." : "Update dashboard"}
        </button>
      </div>

      <label
        onDragOver={onDragOver}
        onDragEnter={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`mt-5 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-6 text-center transition ${
          isDragging
            ? "border-teal bg-teal/10"
            : "border-slate-300 bg-field hover:border-teal hover:bg-teal/5"
        }`}
      >
        <Upload aria-hidden="true" className="size-7 text-teal" />
        <span className="mt-3 text-sm font-semibold text-ink">
          {file ? file.name : "Drop file here or choose current regular student list"}
        </span>
        <span className="mt-1 text-xs text-slate-500">
          Expected columns: Student Name and Event Name
        </span>
        <input
          type="file"
          accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only"
          onChange={onInputChange}
          disabled={isApplying}
        />
      </label>

      {error ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <ResultCard label="Mapped students" value={result.mappedStudents.toLocaleString()} />
          <ResultCard label="Matched rows" value={result.matchedRows.toLocaleString()} />
          <ResultCard label="Updated rows" value={result.updatedRows.toLocaleString()} />
          <ResultCard label="Cleared old days" value={result.clearedStaleRows.toLocaleString()} />
          <ResultCard label="Unmatched rows" value={result.unmatchedRows.toLocaleString()} />
        </div>
      ) : (
        <div className="mt-5 rounded-lg border border-line bg-field p-4 text-sm text-slate-600">
          This updates only the dashboard class fields. Assessment results, quarters, and coach names
          are kept as they are.
        </div>
      )}
    </section>
  );
}

function ResultCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-field p-4">
      <CheckCircle2 aria-hidden="true" className="size-4 text-teal" />
      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}

async function readSheetFile(file: File): Promise<RawSheetRow[]> {
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      throw new Error(`${file.name} does not contain a worksheet.`);
    }

    return XLSX.utils.sheet_to_json<RawSheetRow>(workbook.Sheets[sheetName], {
      defval: "",
      raw: false
    });
  }

  const text = await file.text();
  const parsed = Papa.parse<RawSheetRow>(text.replace(/^\uFEFF/, ""), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.replace(/\uFEFF/g, "").trim()
  });

  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors[0]?.message ?? "Unable to parse the CSV file.");
  }

  return parsed.data;
}

async function fetchAssessmentImportRows(supabase: ReturnType<typeof createClient>) {
  const rows: AssessmentImportMappingRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("assessment_import_rows")
      .select("id, student_name, centre_name, level, session_label")
      .range(from, from + pageSize - 1)
      .order("student_name", { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    rows.push(...((data ?? []) as AssessmentImportMappingRow[]));

    if (!data || data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
}

async function updateAssessmentImportRow(
  supabase: ReturnType<typeof createClient>,
  id: string,
  values: Partial<Pick<AssessmentImportMappingRow, "centre_name" | "level" | "session_label">>
) {
  const { error } = await supabase.from("assessment_import_rows").update(values).eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}

function shouldClearStaleAssessedDay(session: string | null, mappedDays: Set<string>) {
  const sessionLabel = String(session ?? "").trim();

  if (!sessionLabel) {
    return false;
  }

  const sessionDay = getSessionDay(sessionLabel);

  if (!sessionDay || mappedDays.has(sessionDay)) {
    return false;
  }

  return !/\d{1,2}[:.]\d{2}/.test(sessionLabel);
}

function chunkRows<T>(rows: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }

  return chunks;
}
