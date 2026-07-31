"use client";

import clsx from "clsx";
import { Download, Printer, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { compareSessionLabels } from "@/lib/assessmentLogic";
import { downloadCsv, type ExportColumn, printTable } from "@/lib/tableExport";
import type { AssessmentQuarter, QuarterAssessmentRow } from "@/types/assessment";

type QuarterStudentTableProps = {
  rows: QuarterAssessmentRow[];
};

type ResultFilter = "All" | "Pass" | "Fail" | "Absent" | "Not Assessed" | "Blank";
type ConcernFilter = "All" | "Intervention Required" | "Monitor" | "No immediate concern";
type SortMode = "alphabetical" | "session";

const resultFilters: ResultFilter[] = [
  "All",
  "Pass",
  "Fail",
  "Absent",
  "Not Assessed",
  "Blank"
];
const concernFilters: ConcernFilter[] = [
  "All",
  "Intervention Required",
  "Monitor",
  "No immediate concern"
];
const sortOptions: Array<{ value: SortMode; label: string }> = [
  { value: "alphabetical", label: "Alphabetical A-Z" },
  { value: "session", label: "Sort by session" }
];
const tableHeadings = [
  "Student Name",
  "Quarter",
  "Coach",
  "Centre",
  "Session",
  "Level",
  "Result",
  "Concern",
  "Action Required"
];
const exportColumns: ExportColumn<QuarterAssessmentRow>[] = [
  { header: "Student Name", value: (row) => row.studentName },
  { header: "Quarter", value: (row) => row.quarter },
  { header: "Coach", value: (row) => row.coachName },
  { header: "Centre", value: (row) => row.centre },
  { header: "Session", value: (row) => row.session },
  { header: "Level", value: (row) => row.level },
  { header: "Result", value: (row) => row.result || "Blank" },
  { header: "Concern", value: flagLabel },
  { header: "Action Required", value: (row) => row.actionRequired }
];

function flagLabel(row: QuarterAssessmentRow) {
  if (row.flagStatus === "Red") {
    return "Intervention Required";
  }

  if (row.flagStatus === "Yellow") {
    return "Monitor";
  }

  return "No immediate concern";
}

function resultBadge(result: string, quarter: AssessmentQuarter) {
  const isQ2 = quarter === "Q2";

  return clsx(
    "inline-flex min-w-20 justify-center rounded-md border px-2 py-1 text-xs font-semibold",
    result === "Pass" &&
      (isQ2
        ? "border-green-300 bg-green-50 text-green-700"
        : "border-green-500/40 bg-green-100 text-green-800"),
    result === "Fail" &&
      (isQ2
        ? "border-red-300 bg-red-50 text-red-700"
        : "border-red-500/40 bg-red-100 text-red-800"),
    result === "Absent" && "border-slate-300 bg-slate-100 text-slate-600",
    result === "Not Assessed" && "border-slate-300 bg-slate-100 text-slate-600",
    !result && "border-slate-200 bg-paper text-slate-400"
  );
}

export function QuarterStudentTable({ rows }: QuarterStudentTableProps) {
  const [tableSearch, setTableSearch] = useState("");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("All");
  const [concernFilter, setConcernFilter] = useState<ConcernFilter>("All");
  const [sortMode, setSortMode] = useState<SortMode>("alphabetical");
  const visibleRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          matchesTableSearch(row, tableSearch) &&
          matchesResultFilter(row, resultFilter) &&
          matchesConcernFilter(row, concernFilter)
      ).sort((first, second) => compareQuarterRows(first, second, sortMode)),
    [concernFilter, resultFilter, rows, sortMode, tableSearch]
  );

  function handleDownload() {
    downloadCsv("quarter-assessment-rows.csv", exportColumns, visibleRows);
  }

  function handlePrint() {
    printTable("Quarter assessment rows", exportColumns, visibleRows);
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-line bg-paper shadow-panel">
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Quarter assessment rows</h2>
          <p className="text-sm text-slate-500">
            {visibleRows.length.toLocaleString()} of {rows.length.toLocaleString()} rows
          </p>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
          <label className="relative min-w-0 flex-1 lg:max-w-sm">
            <Search
              aria-hidden="true"
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-coral"
            />
            <input
              type="search"
              value={tableSearch}
              onChange={(event) => setTableSearch(event.target.value)}
              className="h-10 w-full rounded-md border border-line bg-field pl-9 pr-3 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
              placeholder="Filter rows"
              aria-label="Filter quarter assessment rows"
            />
          </label>

          <select
            value={resultFilter}
            onChange={(event) => setResultFilter(event.target.value as ResultFilter)}
            className="h-10 rounded-md border border-line bg-field px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
            aria-label="Filter by result"
          >
            {resultFilters.map((filter) => (
              <option key={filter} value={filter}>
                {filter === "All" ? "All results" : filter}
              </option>
            ))}
          </select>

          <select
            value={concernFilter}
            onChange={(event) => setConcernFilter(event.target.value as ConcernFilter)}
            className="h-10 rounded-md border border-line bg-field px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
            aria-label="Filter by concern"
          >
            {concernFilters.map((filter) => (
              <option key={filter} value={filter}>
                {filter === "All" ? "All concerns" : filter}
              </option>
            ))}
          </select>

          <select
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            className="h-10 rounded-md border border-line bg-field px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
            aria-label="Sort quarter assessment rows"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDownload}
              disabled={visibleRows.length === 0}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
            >
              <Download aria-hidden="true" className="size-4" />
              CSV
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={visibleRows.length === 0}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
            >
              <Printer aria-hidden="true" className="size-4" />
              Print
            </button>
          </div>
        </div>
      </div>

      <div className="max-h-[620px] w-full overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-10 bg-paper text-xs uppercase text-slate-500">
            <tr>
              {tableHeadings.map((heading) => (
                <th key={heading} className="border-b border-line px-4 py-3 font-semibold">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr
                key={row.id}
                className={clsx(
                  "align-top transition hover:bg-teal/5",
                  row.flagStatus === "Yellow" && "bg-yellow-50",
                  row.flagStatus === "Red" && "bg-orange-50"
                )}
              >
                <td className="border-b border-line px-4 py-3 font-medium text-ink">
                  {row.studentName}
                </td>
                <td className="border-b border-line px-4 py-3">{row.quarter}</td>
                <td className="border-b border-line px-4 py-3">{row.coachName}</td>
                <td className="border-b border-line px-4 py-3">{row.centre}</td>
                <td className="border-b border-line px-4 py-3">{row.session}</td>
                <td className="max-w-72 border-b border-line px-4 py-3">{row.level}</td>
                <td className="border-b border-line px-4 py-3">
                  <span className={resultBadge(row.result, row.quarter)}>
                    {row.result || "Blank"}
                  </span>
                </td>
                <td className="border-b border-line px-4 py-3">
                  <span
                    className={clsx(
                      "inline-flex rounded-md border px-2 py-1 text-xs font-semibold",
                      row.flagStatus === "Red" &&
                        "border-orange-300 bg-orange-100 text-orange-700",
                      row.flagStatus === "Yellow" &&
                        "border-yellow-300 bg-yellow-100 text-yellow-800",
                      row.flagStatus === "None" && "border-slate-200 bg-paper text-slate-600"
                    )}
                  >
                    {flagLabel(row)}
                  </span>
                </td>
                <td className="border-b border-line px-4 py-3 font-medium text-slate-700">
                  {row.actionRequired}
                </td>
              </tr>
            ))}
            {visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan={tableHeadings.length}
                  className="border-b border-line px-4 py-8 text-center text-sm text-slate-500"
                >
                  No quarter assessment rows match the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function matchesTableSearch(row: QuarterAssessmentRow, search: string) {
  const normalizedSearch = normalizeFilterValue(search);

  if (!normalizedSearch) {
    return true;
  }

  return [
    row.studentName,
    row.quarter,
    row.coachName,
    row.centre,
    row.session,
    row.level,
    row.result,
    flagLabel(row),
    row.actionRequired
  ]
    .map((value) => normalizeFilterValue(value))
    .some((value) => value.includes(normalizedSearch));
}

function matchesResultFilter(row: QuarterAssessmentRow, resultFilter: ResultFilter) {
  if (resultFilter === "All") {
    return true;
  }

  if (resultFilter === "Blank") {
    return !row.result;
  }

  return row.result === resultFilter;
}

function matchesConcernFilter(row: QuarterAssessmentRow, concernFilter: ConcernFilter) {
  return concernFilter === "All" || flagLabel(row) === concernFilter;
}

function compareQuarterRows(
  first: QuarterAssessmentRow,
  second: QuarterAssessmentRow,
  sortMode: SortMode
) {
  const nameCompare = first.studentName.localeCompare(second.studentName);
  const sessionCompare = compareSessionLabels(first.session, second.session);
  const quarterCompare = first.quarter.localeCompare(second.quarter);

  if (sortMode === "session") {
    return (
      sessionCompare ||
      first.centre.localeCompare(second.centre) ||
      first.coachName.localeCompare(second.coachName) ||
      nameCompare ||
      quarterCompare
    );
  }

  return nameCompare || sessionCompare || quarterCompare;
}

function normalizeFilterValue(value: string | undefined) {
  return String(value ?? "").trim().toLowerCase();
}
