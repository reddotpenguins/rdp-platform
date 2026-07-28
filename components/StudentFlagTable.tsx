"use client";

import clsx from "clsx";
import { Download, Printer, Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
  getQuarterCentre,
  getQuarterCoachName,
  getQuarterLevel,
  getQuarterResult,
  getQuarterSession
} from "@/lib/assessmentLogic";
import { downloadCsv, type ExportColumn, printTable } from "@/lib/tableExport";
import type { AssessmentQuarter, StudentAssessmentRecord } from "@/types/assessment";

type StudentFlagTableProps = {
  records: StudentAssessmentRecord[];
  selectedQuarter: "All" | AssessmentQuarter;
};

type ResultFilter = "All" | "Pass" | "Fail" | "Absent" | "Not Assessed" | "Blank";
type ConcernFilter = "All" | "Intervention Required" | "Monitor" | "No immediate concern";

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

function flagBadge(record: StudentAssessmentRecord) {
  if (record.flagStatus === "Red") {
    return "Intervention Required";
  }

  if (record.flagStatus === "Yellow") {
    return "Monitor";
  }

  return "No immediate concern";
}

function resultBadge(result: string) {
  return clsx(
    "inline-flex min-w-20 justify-center rounded-md border px-2 py-1 text-xs font-semibold",
    result === "Pass" && "border-teal/30 bg-teal/10 text-teal",
    result === "Fail" && "border-coral/30 bg-coral/10 text-coral",
    result === "Absent" && "border-slate-300 bg-slate-100 text-slate-600",
    result === "Not Assessed" && "border-slate-300 bg-slate-100 text-slate-600",
    !result && "border-slate-200 bg-paper text-slate-400"
  );
}

export function StudentFlagTable({ records, selectedQuarter }: StudentFlagTableProps) {
  const [tableSearch, setTableSearch] = useState("");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("All");
  const [concernFilter, setConcernFilter] = useState<ConcernFilter>("All");
  const showAllQuarters = selectedQuarter === "All";
  const resultHeadings = showAllQuarters
    ? ["Q1 Result", "Q2 Result"]
    : [`${selectedQuarter} Result`];
  const tableHeadings = [
    "Student Name",
    "Coach",
    "Centre",
    "Level",
    "Session",
    ...resultHeadings,
    "Concern",
    "Action Required"
  ];
  const visibleRecords = useMemo(
    () =>
      records.filter(
        (record) =>
          matchesTableSearch(record, selectedQuarter, tableSearch) &&
          matchesResultFilter(record, selectedQuarter, resultFilter) &&
          matchesConcernFilter(record, concernFilter)
      ),
    [concernFilter, records, resultFilter, selectedQuarter, tableSearch]
  );
  const exportColumns = useMemo(
    () => getExportColumns(selectedQuarter),
    [selectedQuarter]
  );

  function handleDownload() {
    downloadCsv(
      `student-results-${selectedQuarter.toLowerCase()}.csv`,
      exportColumns,
      visibleRecords
    );
  }

  function handlePrint() {
    printTable(
      selectedQuarter === "All" ? "Student results" : `Student results - ${selectedQuarter}`,
      exportColumns,
      visibleRecords
    );
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-line bg-paper shadow-panel">
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Student results</h2>
          <p className="text-sm text-slate-500">
            {visibleRecords.length.toLocaleString()} of {records.length.toLocaleString()} rows
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
              placeholder="Filter students"
              aria-label="Filter student results"
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

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDownload}
              disabled={visibleRecords.length === 0}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
            >
              <Download aria-hidden="true" className="size-4" />
              CSV
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={visibleRecords.length === 0}
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
            {visibleRecords.map((record) => (
              <tr
                key={record.id}
                className={clsx(
                  "align-top transition hover:bg-teal/5",
                  record.flagStatus === "Yellow" && "bg-yellow-50",
                  record.flagStatus === "Red" && "bg-red-50"
                )}
              >
                <td className="border-b border-line px-4 py-3 font-medium text-ink">
                  {record.studentName}
                </td>
                <td className="border-b border-line px-4 py-3 text-slate-700">
                  {getDisplayCoach(record, selectedQuarter)}
                </td>
                <td className="border-b border-line px-4 py-3 text-slate-700">
                  {getDisplayCentre(record, selectedQuarter)}
                </td>
                <td className="max-w-72 border-b border-line px-4 py-3 text-slate-700">
                  {getDisplayLevel(record, selectedQuarter)}
                </td>
                <td className="border-b border-line px-4 py-3 text-slate-700">
                  {getDisplaySession(record, selectedQuarter)}
                </td>
                {showAllQuarters ? (
                  <>
                    <td className="border-b border-line px-4 py-3">
                      <span className={resultBadge(record.q1Result)}>
                        {record.q1Result || "Blank"}
                      </span>
                    </td>
                    <td className="border-b border-line px-4 py-3">
                      <span className={resultBadge(record.q2Result)}>
                        {record.q2Result || "Blank"}
                      </span>
                    </td>
                  </>
                ) : (
                  <td className="border-b border-line px-4 py-3">
                    <span className={resultBadge(getQuarterResult(record, selectedQuarter))}>
                      {getQuarterResult(record, selectedQuarter) || "Blank"}
                    </span>
                  </td>
                )}
                <td className="border-b border-line px-4 py-3">
                  <span
                    className={clsx(
                      "inline-flex rounded-md border px-2 py-1 text-xs font-semibold",
                      record.flagStatus === "Red" && "border-red-300 bg-red-100 text-red-700",
                      record.flagStatus === "Yellow" &&
                        "border-amber/40 bg-amber/15 text-yellow-800",
                      record.flagStatus === "None" && "border-slate-200 bg-paper text-slate-600"
                    )}
                  >
                    {flagBadge(record)}
                  </span>
                </td>
                <td className="border-b border-line px-4 py-3 font-medium text-slate-700">
                  {record.actionRequired}
                </td>
              </tr>
            ))}
            {visibleRecords.length === 0 ? (
              <tr>
                <td
                  colSpan={tableHeadings.length}
                  className="border-b border-line px-4 py-8 text-center text-sm text-slate-500"
                >
                  No student results match the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function getDisplayCoach(
  record: StudentAssessmentRecord,
  selectedQuarter: "All" | AssessmentQuarter
) {
  return selectedQuarter === "All" ? record.coachName : getQuarterCoachName(record, selectedQuarter);
}

function getDisplayCentre(
  record: StudentAssessmentRecord,
  selectedQuarter: "All" | AssessmentQuarter
) {
  return selectedQuarter === "All"
    ? record.centre || "-"
    : getQuarterCentre(record, selectedQuarter) || "-";
}

function getDisplayLevel(
  record: StudentAssessmentRecord,
  selectedQuarter: "All" | AssessmentQuarter
) {
  return selectedQuarter === "All"
    ? record.level || "-"
    : getQuarterLevel(record, selectedQuarter) || "-";
}

function getDisplaySession(
  record: StudentAssessmentRecord,
  selectedQuarter: "All" | AssessmentQuarter
) {
  return selectedQuarter === "All"
    ? record.session || "Not provided"
    : getQuarterSession(record, selectedQuarter);
}

function matchesTableSearch(
  record: StudentAssessmentRecord,
  selectedQuarter: "All" | AssessmentQuarter,
  search: string
) {
  const normalizedSearch = normalizeFilterValue(search);

  if (!normalizedSearch) {
    return true;
  }

  return [
    record.studentName,
    record.studentCode,
    getDisplayCoach(record, selectedQuarter),
    getDisplayCentre(record, selectedQuarter),
    getDisplayLevel(record, selectedQuarter),
    getDisplaySession(record, selectedQuarter),
    record.q1Result,
    record.q2Result,
    selectedQuarter === "All" ? "" : getQuarterResult(record, selectedQuarter),
    flagBadge(record),
    record.actionRequired
  ]
    .map((value) => normalizeFilterValue(value))
    .some((value) => value.includes(normalizedSearch));
}

function matchesResultFilter(
  record: StudentAssessmentRecord,
  selectedQuarter: "All" | AssessmentQuarter,
  resultFilter: ResultFilter
) {
  if (resultFilter === "All") {
    return true;
  }

  const results =
    selectedQuarter === "All"
      ? [record.q1Result, record.q2Result]
      : [getQuarterResult(record, selectedQuarter)];

  if (resultFilter === "Blank") {
    return results.some((result) => !result);
  }

  return results.some((result) => result === resultFilter);
}

function matchesConcernFilter(record: StudentAssessmentRecord, concernFilter: ConcernFilter) {
  return concernFilter === "All" || flagBadge(record) === concernFilter;
}

function normalizeFilterValue(value: string | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function getExportColumns(
  selectedQuarter: "All" | AssessmentQuarter
): ExportColumn<StudentAssessmentRecord>[] {
  const sharedColumns: ExportColumn<StudentAssessmentRecord>[] = [
    { header: "Student Name", value: (record) => record.studentName },
    { header: "Coach", value: (record) => getDisplayCoach(record, selectedQuarter) },
    { header: "Centre", value: (record) => getDisplayCentre(record, selectedQuarter) },
    { header: "Level", value: (record) => getDisplayLevel(record, selectedQuarter) },
    { header: "Session", value: (record) => getDisplaySession(record, selectedQuarter) }
  ];

  const resultColumns: ExportColumn<StudentAssessmentRecord>[] =
    selectedQuarter === "All"
      ? [
          { header: "Q1 Result", value: (record) => record.q1Result || "Blank" },
          { header: "Q2 Result", value: (record) => record.q2Result || "Blank" }
        ]
      : [
          {
            header: `${selectedQuarter} Result`,
            value: (record) => getQuarterResult(record, selectedQuarter) || "Blank"
          }
        ];

  return [
    ...sharedColumns,
    ...resultColumns,
    { header: "Concern", value: flagBadge },
    { header: "Action Required", value: (record) => record.actionRequired }
  ];
}
