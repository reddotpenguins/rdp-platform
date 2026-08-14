"use client";

import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { Download, FileSpreadsheet, Printer, RefreshCcw } from "lucide-react";
import {
  buildAssessorSheetRows,
  getAssessorSessionPeriod,
  getAssessorSessionTiming,
  getAssessorSheetColumns,
  getAssessorSheetSummary,
  type AssessorSheetRow
} from "@/lib/assessorSheets";
import { downloadCsv } from "@/lib/tableExport";

type UploadedFiles = {
  assessment: File | null;
  regular: File | null;
  makeUp: File | null;
};

type RawSheetRow = Record<string, unknown>;

const emptyFiles: UploadedFiles = {
  assessment: null,
  regular: null,
  makeUp: null
};

export function AssessorSheetBuilder() {
  const [files, setFiles] = useState<UploadedFiles>(emptyFiles);
  const [rows, setRows] = useState<AssessorSheetRow[]>([]);
  const [selectedDay, setSelectedDay] = useState("all");
  const [selectedLocation, setSelectedLocation] = useState("all");
  const [selectedPeriod, setSelectedPeriod] = useState("all");
  const [selectedTiming, setSelectedTiming] = useState("all");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetNonce, setResetNonce] = useState(0);

  const summary = useMemo(() => getAssessorSheetSummary(rows), [rows]);
  const columns = useMemo(() => getAssessorSheetColumns(), []);
  const rowsMatchingDayAndLocation = useMemo(
    () =>
      rows.filter((row) => {
        const matchesDay = selectedDay === "all" || row.sessionDay === selectedDay;
        const matchesLocation = selectedLocation === "all" || row.location === selectedLocation;

        return matchesDay && matchesLocation;
      }),
    [rows, selectedDay, selectedLocation]
  );
  const periodOptions = useMemo(
    () => getAssessorSheetSummary(rowsMatchingDayAndLocation).sessionPeriods,
    [rowsMatchingDayAndLocation]
  );
  const rowsMatchingPeriod = useMemo(
    () =>
      selectedPeriod === "all"
        ? rowsMatchingDayAndLocation
        : rowsMatchingDayAndLocation.filter(
            (row) => getAssessorSessionPeriod(row.sessionTime) === selectedPeriod
          ),
    [rowsMatchingDayAndLocation, selectedPeriod]
  );
  const timingOptions = useMemo(
    () => getAssessorSheetSummary(rowsMatchingPeriod).timings,
    [rowsMatchingPeriod]
  );
  const visibleRows = useMemo(
    () =>
      selectedTiming === "all"
        ? rowsMatchingPeriod
        : rowsMatchingPeriod.filter(
            (row) => getAssessorSessionTiming(row.sessionTime) === selectedTiming
          ),
    [rowsMatchingPeriod, selectedTiming]
  );

  useEffect(() => {
    if (selectedPeriod !== "all" && !periodOptions.includes(selectedPeriod)) {
      setSelectedPeriod("all");
    }
  }, [selectedPeriod, periodOptions]);

  useEffect(() => {
    if (selectedTiming !== "all" && !timingOptions.includes(selectedTiming)) {
      setSelectedTiming("all");
    }
  }, [selectedTiming, timingOptions]);

  function updateFile(key: keyof UploadedFiles, file: File | null) {
    setFiles((currentFiles) => ({ ...currentFiles, [key]: file }));
  }

  async function generateRows() {
    if (!files.regular && !files.makeUp) {
      setError("Choose at least the regular student list or the special enrolment list.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const [assessmentRows, regularRows, makeUpRows] = await Promise.all([
        files.assessment ? readSheetFile(files.assessment) : Promise.resolve([]),
        files.regular ? readSheetFile(files.regular) : Promise.resolve([]),
        files.makeUp ? readSheetFile(files.makeUp) : Promise.resolve([])
      ]);
      const nextRows = buildAssessorSheetRows({
        assessmentRows,
        regularRows,
        makeUpRows
      });

      if (nextRows.length === 0) {
        throw new Error("No students were found in the selected files.");
      }

      setRows(nextRows);
      setSelectedDay("all");
      setSelectedLocation("all");
      setSelectedPeriod("all");
      setSelectedTiming("all");
    } catch (generateError) {
      setRows([]);
      setError(
        generateError instanceof Error
          ? generateError.message
          : "Unable to generate the assessor sheet."
      );
    } finally {
      setIsGenerating(false);
    }
  }

  function resetBuilder() {
    setFiles(emptyFiles);
    setRows([]);
    setSelectedDay("all");
    setSelectedLocation("all");
    setSelectedPeriod("all");
    setSelectedTiming("all");
    setError(null);
    setResetNonce((currentNonce) => currentNonce + 1);
  }

  function downloadVisibleRows() {
    downloadCsv("rdp-assessor-marking-sheet.csv", columns, visibleRows);
  }

  function printVisibleRows() {
    printAssessorSheets("LTS Assessor Marking Sheet", columns, visibleRows);
  }

  return (
    <section className="rounded-lg border border-line bg-paper p-5 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-lg bg-teal/10 text-teal">
            <FileSpreadsheet aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 className="text-xl font-semibold text-ink">Assessor marking sheets</h2>
            <p className="text-sm text-slate-500">
              Build a printable Pass/Fail sheet from regular classes and make-up enrolments.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={resetBuilder}
          className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal"
        >
          <RefreshCcw aria-hidden="true" className="size-4" />
          Reset
        </button>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <FilePicker
          key={`assessment-${resetNonce}`}
          label="Assessment file"
          description="Use the RDP_LTS assessment or mapped upload-ready file for coach and level data."
          file={files.assessment}
          onFileChange={(file) => updateFile("assessment", file)}
        />
        <FilePicker
          key={`regular-${resetNonce}`}
          label="Regular student list"
          description="Use Custom_Student_List here. This is the file with Event Name class timings."
          file={files.regular}
          onFileChange={(file) => updateFile("regular", file)}
        />
        <FilePicker
          key={`make-up-${resetNonce}`}
          label="Special enrolments"
          description="Adds make-up students for the printed session sheet."
          file={files.makeUp}
          onFileChange={(file) => updateFile("makeUp", file)}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void generateRows()}
          disabled={isGenerating}
          className="inline-flex h-10 items-center rounded-md bg-teal px-4 text-sm font-semibold text-white transition hover:bg-teal/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isGenerating ? "Generating..." : "Generate sheet"}
        </button>
        {rows.length > 0 ? (
          <>
            <FilterSelect
              label="Day"
              value={selectedDay}
              onChange={setSelectedDay}
              allLabel="All days"
              options={summary.days}
            />
            <FilterSelect
              label="Centre"
              value={selectedLocation}
              onChange={setSelectedLocation}
              allLabel="All centres"
              options={summary.locations}
            />
            <FilterSelect
              label="AM/PM"
              value={selectedPeriod}
              onChange={setSelectedPeriod}
              allLabel="All AM/PM"
              options={periodOptions}
            />
            <FilterSelect
              label="Timing"
              value={selectedTiming}
              onChange={setSelectedTiming}
              allLabel="All timings"
              options={timingOptions}
            />
            <button
              type="button"
              onClick={downloadVisibleRows}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal"
            >
              <Download aria-hidden="true" className="size-4" />
              Download CSV
            </button>
            <button
              type="button"
              onClick={printVisibleRows}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal"
            >
              <Printer aria-hidden="true" className="size-4" />
              Print
            </button>
            <span className="text-sm font-semibold text-slate-500">
              Showing {visibleRows.length.toLocaleString()} of {rows.length.toLocaleString()}
            </span>
          </>
        ) : null}
      </div>

      {error ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}

      {rows.length > 0 ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryCard label="Rows" value={summary.totalRows.toLocaleString()} />
            <SummaryCard label="Regular" value={summary.regularRows.toLocaleString()} />
            <SummaryCard label="Make up" value={summary.makeUpRows.toLocaleString()} />
            <SummaryCard
              label="Missing instructor"
              value={summary.missingInstructorRows.toLocaleString()}
            />
            <SummaryCard label="Missing session" value={summary.missingSessionRows.toLocaleString()} />
          </div>

          <div className="mt-5 overflow-hidden rounded-lg border border-line">
            <div className="max-h-[560px] overflow-auto">
              <table className="min-w-full divide-y divide-line text-sm">
                <thead className="sticky top-0 z-10 bg-orange-50 text-left text-xs font-semibold uppercase tracking-wide text-orange-900">
                  <tr>
                    {columns.map((column) => (
                      <th key={column.header} className="px-3 py-3">
                        {column.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-paper">
                  {visibleRows.map((row) => (
                    <tr
                      key={row.id}
                      className={
                        row.classType === "Make Up" ? "bg-slate-50/90" : "bg-paper"
                      }
                    >
                      {columns.map((column) => (
                        <td key={column.header} className="px-3 py-3 text-slate-700">
                          {column.value(row) || (
                            <span className="text-slate-400">
                              {column.header === "Pass/Fail" ? "Mark on paper" : "-"}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-5 rounded-lg border border-line bg-field p-4 text-sm text-slate-600">
          Add the regular class CSV and special enrolment CSV, then generate a sheet for printing.
        </div>
      )}
    </section>
  );
}

function FilePicker({
  description,
  file,
  label,
  onFileChange
}: {
  description: string;
  file: File | null;
  label: string;
  onFileChange: (file: File | null) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    onFileChange(event.target.files?.[0] ?? null);
  }

  function onDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
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
    onFileChange(event.dataTransfer.files?.[0] ?? null);
  }

  return (
    <label
      onDragOver={onDragOver}
      onDragEnter={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`flex min-h-32 cursor-pointer flex-col justify-between rounded-lg border border-dashed p-4 transition ${
        isDragging
          ? "border-teal bg-teal/10"
          : "border-slate-300 bg-field hover:border-teal hover:bg-teal/5"
      }`}
    >
      <span>
        <span className="block text-sm font-semibold text-ink">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>
      </span>
      <span className="mt-4 inline-flex items-center justify-between gap-3 rounded-md border border-line bg-paper px-3 py-2 text-sm text-slate-600">
        <span className="truncate">
          {file?.name ?? "Drop file here or choose CSV, XLS, or XLSX"}
        </span>
        <span className="shrink-0 font-semibold text-teal">Browse</span>
      </span>
      <input
        type="file"
        accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="sr-only"
        onChange={onInputChange}
      />
    </label>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-field p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}

function FilterSelect({
  allLabel,
  label,
  onChange,
  options,
  value
}: {
  allLabel: string;
  label: string;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <label className="text-sm font-semibold text-slate-600">
      <span className="mr-2">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 max-w-[220px] rounded-md border border-line bg-paper px-3 text-sm font-semibold text-ink outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
      >
        <option value="all">{allLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
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
  const result = Papa.parse<RawSheetRow>(text, {
    header: true,
    skipEmptyLines: true
  });

  if (result.errors.length > 0) {
    throw new Error(`${file.name}: ${result.errors[0].message}`);
  }

  return result.data;
}

function printAssessorSheets(
  title: string,
  columns: ReturnType<typeof getAssessorSheetColumns>,
  rows: AssessorSheetRow[]
) {
  const printWindow = window.open("", "_blank", "width=1100,height=800");

  if (!printWindow) {
    window.print();
    return;
  }

  const groupedRows = groupRowsBySession(rows);
  const sections = groupedRows
    .map(
      ([session, sessionRows]) => `
      <section class="session-section">
        <div class="sheet-header">
          <h2>${escapeHtml(session || "Unassigned session")}</h2>
          <span>${sessionRows.length} student${sessionRows.length === 1 ? "" : "s"}</span>
        </div>
        <table>
          <thead>
            <tr>${columns.map((column) => `<th>${escapeHtml(column.header)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${sessionRows
              .map(
                (row) => `
                  <tr>
                    ${columns
                      .map((column) => `<td>${escapeHtml(String(column.value(row) || "")) || "&nbsp;"}</td>`)
                      .join("")}
                  </tr>`
              )
              .join("")}
          </tbody>
        </table>
      </section>`
    )
    .join("");

  printWindow.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      body {
        color: #1f2937;
        font-family: Arial, sans-serif;
        margin: 20px;
      }

      h1 {
        color: #3d2115;
        font-size: 18px;
        margin: 0 0 18px;
      }

      .sheet-header {
        align-items: baseline;
        border-bottom: 2px solid #f4a261;
        display: flex;
        justify-content: space-between;
        margin-bottom: 10px;
        padding-bottom: 6px;
      }

      h2 {
        color: #7c2d12;
        font-size: 16px;
        margin: 0;
      }

      .sheet-header span {
        color: #64748b;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
      }

      table {
        border-collapse: collapse;
        font-size: 11px;
        margin-bottom: 20px;
        width: 100%;
      }

      th,
      td {
        border: 1px solid #d1d5db;
        padding: 7px 8px;
        text-align: left;
        vertical-align: top;
      }

      th {
        background: #fff1e6;
        color: #7c2d12;
        font-size: 10px;
        text-transform: uppercase;
      }

      td:last-child {
        min-width: 72px;
      }

      @media print {
        .session-section {
          break-after: page;
        }

        .session-section:last-child {
          break-after: auto;
        }
      }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    ${sections}
  </body>
</html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function groupRowsBySession(rows: AssessorSheetRow[]) {
  const groups = new Map<string, AssessorSheetRow[]>();

  for (const row of rows) {
    const session = row.sessionTime || "Unassigned session";
    const groupLabel = row.location ? `${row.location} - ${session}` : session;

    groups.set(groupLabel, [...(groups.get(groupLabel) ?? []), row]);
  }

  return Array.from(groups.entries());
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
