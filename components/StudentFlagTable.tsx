"use client";

import clsx from "clsx";
import { Download, Eye, Printer, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  compareSessionLabels,
  getBestAvailableLevel,
  getDisplayedQuarters,
  getQuarterCentre,
  getQuarterCoachName,
  getQuarterLevel,
  getQuarterResult,
  getQuarterSession
} from "@/lib/assessmentLogic";
import {
  displayAssessmentResult,
  getLatestAssessedQuarter,
  getStatusBadgeClass,
  getStudentAssessmentStatus,
  resultMatchesFilter,
  studentAssessmentStatuses,
  type StudentAssessmentStatus
} from "@/lib/assessmentStatus";
import { downloadCsv, type ExportColumn, printTable } from "@/lib/tableExport";
import type { AssessmentQuarter, AssessmentResult, StudentAssessmentRecord } from "@/types/assessment";

type StudentFlagTableProps = {
  records: StudentAssessmentRecord[];
  selectedCoach: string;
  selectedQuarter: "All" | AssessmentQuarter;
};

type ResultFilter = "All" | Exclude<AssessmentResult, "">;
type StatusFilter = "All" | StudentAssessmentStatus;
type SortMode = "alphabetical" | "session";

const resultFilters: ResultFilter[] = ["All", "Pass", "Fail", "Absent", "Not Assessed"];
const statusFilters: StatusFilter[] = ["All", ...studentAssessmentStatuses];
const sortOptions: Array<{ value: SortMode; label: string }> = [
  { value: "alphabetical", label: "Alphabetical A-Z" },
  { value: "session", label: "Sort by session" }
];

export function StudentFlagTable({
  records,
  selectedCoach,
  selectedQuarter
}: StudentFlagTableProps) {
  const [tableSearch, setTableSearch] = useState("");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("All");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [sortMode, setSortMode] = useState<SortMode>("alphabetical");
  const [selectedRecord, setSelectedRecord] = useState<StudentAssessmentRecord | null>(null);
  const displayedQuarters = useMemo(
    () => getDisplayedQuarters(records, selectedQuarter),
    [records, selectedQuarter]
  );
  const resultHeadings = displayedQuarters.map((quarter) => `${quarter} Result`);
  const tableHeadings = [
    "Student Name",
    "Coach",
    "Centre",
    "Level",
    "Session",
    ...resultHeadings,
    "Status",
    "Review"
  ];
  const visibleRecords = useMemo(
    () =>
      records.filter(
        (record) =>
          matchesTableSearch(record, selectedQuarter, selectedCoach, displayedQuarters, tableSearch) &&
          matchesResultFilter(record, displayedQuarters, resultFilter) &&
          matchesStatusFilter(record, selectedQuarter, statusFilter)
      ).sort((first, second) => compareStudentRecords(first, second, selectedQuarter, sortMode)),
    [
      displayedQuarters,
      records,
      resultFilter,
      selectedCoach,
      selectedQuarter,
      sortMode,
      statusFilter,
      tableSearch
    ]
  );
  const exportColumns = useMemo(
    () => getExportColumns(selectedQuarter, selectedCoach, displayedQuarters),
    [displayedQuarters, selectedCoach, selectedQuarter]
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
    <>
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
                  {filter === "All" ? "All results" : displayAssessmentResult(filter)}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="h-10 rounded-md border border-line bg-field px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
              aria-label="Filter by status"
            >
              {statusFilters.map((filter) => (
                <option key={filter} value={filter}>
                  {filter === "All" ? "All statuses" : filter}
                </option>
              ))}
            </select>

            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              className="h-10 rounded-md border border-line bg-field px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
              aria-label="Sort student results"
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
              {visibleRecords.map((record) => {
                const status = getStudentAssessmentStatus(record, selectedQuarter);

                return (
                  <tr
                    key={record.id}
                    className={clsx(
                      "align-top transition hover:bg-teal/5",
                      status === "Monitor" && "bg-yellow-50",
                      status === "Require intervention" && "bg-orange-50"
                    )}
                  >
                    <td className="border-b border-line px-4 py-3 font-medium text-ink">
                      {record.studentName}
                    </td>
                    <td className="border-b border-line px-4 py-3 text-slate-700">
                      {getDisplayCoach(record, selectedQuarter, selectedCoach)}
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
                    {displayedQuarters.map((quarter) => {
                      const result = getQuarterResult(record, quarter);

                      return (
                        <td
                          className="border-b border-line px-4 py-3"
                          key={`${record.id}-${quarter}-result`}
                        >
                          <span className={resultBadge(result, quarter)}>
                            {displayAssessmentResult(result)}
                          </span>
                        </td>
                      );
                    })}
                    <td className="border-b border-line px-4 py-3">
                      <span
                        className={clsx(
                          "inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-xs font-semibold",
                          getStatusBadgeClass(status)
                        )}
                      >
                        {status}
                      </span>
                    </td>
                    <td className="border-b border-line px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setSelectedRecord(record)}
                        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal"
                      >
                        <Eye aria-hidden="true" className="size-4" />
                        Review
                      </button>
                    </td>
                  </tr>
                );
              })}
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

      {selectedRecord ? (
        <StudentReviewPanel
          displayedQuarters={displayedQuarters}
          onClose={() => setSelectedRecord(null)}
          record={selectedRecord}
          selectedCoach={selectedCoach}
          selectedQuarter={selectedQuarter}
        />
      ) : null}
    </>
  );
}

function StudentReviewPanel({
  displayedQuarters,
  onClose,
  record,
  selectedCoach,
  selectedQuarter
}: {
  displayedQuarters: AssessmentQuarter[];
  onClose: () => void;
  record: StudentAssessmentRecord;
  selectedCoach: string;
  selectedQuarter: "All" | AssessmentQuarter;
}) {
  const status = getStudentAssessmentStatus(record, selectedQuarter);
  const latestAssessedQuarter = getLatestAssessedQuarter(record);
  const latestAssessedLabel = latestAssessedQuarter
    ? `${latestAssessedQuarter} - ${displayAssessmentResult(
        getQuarterResult(record, latestAssessedQuarter)
      )}`
    : "Not assessed";

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 p-3 sm:p-5"
      role="dialog"
    >
      <button
        type="button"
        aria-label="Close review"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <aside className="relative flex h-full w-full max-w-xl flex-col overflow-hidden rounded-lg border border-line bg-paper shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-line p-4">
          <div>
            <p className="text-sm font-semibold uppercase text-teal">Swimmer summary</p>
            <h3 className="mt-1 text-xl font-semibold text-ink">{record.studentName}</h3>
            <span
              className={clsx(
                "mt-3 inline-flex rounded-md border px-2 py-1 text-xs font-semibold",
                getStatusBadgeClass(status)
              )}
            >
              {status}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-md border border-line text-slate-500 transition hover:border-teal hover:text-teal"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            <ReviewDetail label="Coach" value={getDisplayCoach(record, selectedQuarter, selectedCoach)} />
            <ReviewDetail label="Centre" value={getDisplayCentre(record, selectedQuarter)} />
            <ReviewDetail label="Session" value={getDisplaySession(record, selectedQuarter)} />
            <ReviewDetail label="Level" value={getDisplayLevel(record, selectedQuarter)} />
            <ReviewDetail label="Last assessed" value={latestAssessedLabel} />
            <ReviewDetail label="Focus" value={getFocusSummary(status)} />
          </dl>

          <div className="mt-4 overflow-hidden rounded-lg border border-line">
            <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
              <thead className="bg-field text-xs uppercase text-slate-500">
                <tr>
                  {["Quarter", "Coach", "Level", "Session", "Result"].map((heading) => (
                    <th key={heading} className="border-b border-line px-3 py-2 font-semibold">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedQuarters.map((quarter) => {
                  const result = getQuarterResult(record, quarter);

                  return (
                    <tr key={`${record.id}-${quarter}-review`}>
                      <td className="border-b border-line px-3 py-2 font-medium text-ink">
                        {quarter}
                      </td>
                      <td className="border-b border-line px-3 py-2">
                        {getQuarterCoachName(record, quarter)}
                      </td>
                      <td className="border-b border-line px-3 py-2">
                        {getQuarterLevel(record, quarter) || "-"}
                      </td>
                      <td className="border-b border-line px-3 py-2">
                        {getQuarterSession(record, quarter)}
                      </td>
                      <td className="border-b border-line px-3 py-2">
                        <span className={resultBadge(result, quarter)}>
                          {displayAssessmentResult(result)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ReviewDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-field p-3">
      <dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-ink">{value || "-"}</dd>
    </div>
  );
}

function getDisplayCoach(
  record: StudentAssessmentRecord,
  selectedQuarter: "All" | AssessmentQuarter,
  selectedCoach: string
) {
  if (selectedQuarter !== "All") {
    return getQuarterCoachName(record, selectedQuarter);
  }

  return selectedCoach === "All" ? record.coachName : selectedCoach;
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
    ? getBestAvailableLevel(record) || "-"
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
  selectedCoach: string,
  displayedQuarters: AssessmentQuarter[],
  search: string
) {
  const normalizedSearch = normalizeFilterValue(search);

  if (!normalizedSearch) {
    return true;
  }

  return [
    record.studentName,
    record.studentCode,
    getDisplayCoach(record, selectedQuarter, selectedCoach),
    getDisplayCentre(record, selectedQuarter),
    getDisplayLevel(record, selectedQuarter),
    getDisplaySession(record, selectedQuarter),
    ...displayedQuarters.map((quarter) => displayAssessmentResult(getQuarterResult(record, quarter))),
    getStudentAssessmentStatus(record, selectedQuarter)
  ]
    .map((value) => normalizeFilterValue(value))
    .some((value) => value.includes(normalizedSearch));
}

function matchesResultFilter(
  record: StudentAssessmentRecord,
  displayedQuarters: AssessmentQuarter[],
  resultFilter: ResultFilter
) {
  if (resultFilter === "All") {
    return true;
  }

  return displayedQuarters
    .map((quarter) => getQuarterResult(record, quarter))
    .some((result) => resultMatchesFilter(result, resultFilter));
}

function matchesStatusFilter(
  record: StudentAssessmentRecord,
  selectedQuarter: "All" | AssessmentQuarter,
  statusFilter: StatusFilter
) {
  return (
    statusFilter === "All" ||
    getStudentAssessmentStatus(record, selectedQuarter) === statusFilter
  );
}

function compareStudentRecords(
  first: StudentAssessmentRecord,
  second: StudentAssessmentRecord,
  selectedQuarter: "All" | AssessmentQuarter,
  sortMode: SortMode
) {
  const nameCompare = first.studentName.localeCompare(second.studentName);
  const sessionCompare = compareSessionLabels(
    getDisplaySession(first, selectedQuarter),
    getDisplaySession(second, selectedQuarter)
  );

  if (sortMode === "session") {
    return sessionCompare || nameCompare;
  }

  return nameCompare || sessionCompare;
}

function normalizeFilterValue(value: string | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function getExportColumns(
  selectedQuarter: "All" | AssessmentQuarter,
  selectedCoach: string,
  displayedQuarters: AssessmentQuarter[]
): ExportColumn<StudentAssessmentRecord>[] {
  const sharedColumns: ExportColumn<StudentAssessmentRecord>[] = [
    { header: "Student Name", value: (record) => record.studentName },
    { header: "Coach", value: (record) => getDisplayCoach(record, selectedQuarter, selectedCoach) },
    { header: "Centre", value: (record) => getDisplayCentre(record, selectedQuarter) },
    { header: "Level", value: (record) => getDisplayLevel(record, selectedQuarter) },
    { header: "Session", value: (record) => getDisplaySession(record, selectedQuarter) }
  ];

  const resultColumns: ExportColumn<StudentAssessmentRecord>[] =
    selectedQuarter === "All"
      ? displayedQuarters.map((quarter) => ({
          header: `${quarter} Result`,
          value: (record) => displayAssessmentResult(getQuarterResult(record, quarter))
        }))
      : [
          {
            header: `${selectedQuarter} Result`,
            value: (record) =>
              displayAssessmentResult(getQuarterResult(record, selectedQuarter))
          }
        ];

  return [
    ...sharedColumns,
    ...resultColumns,
    { header: "Status", value: (record) => getStudentAssessmentStatus(record, selectedQuarter) }
  ];
}

function resultBadge(result: string, quarter?: AssessmentQuarter) {
  return clsx(
    "inline-flex min-w-24 justify-center rounded-md border px-2 py-1 text-xs font-semibold",
    result === "Pass" && getPassBadgeClass(quarter),
    result === "Fail" && getFailBadgeClass(quarter),
    result === "Absent" && "border-slate-300 bg-slate-100 text-slate-600",
    (result === "Not Assessed" || !result) && "border-slate-300 bg-slate-100 text-slate-600"
  );
}

function getFocusSummary(status: StudentAssessmentStatus) {
  if (status === "Require intervention") {
    return "Repeated fail pattern. Review the key skill gap and agree the next coaching focus.";
  }

  if (status === "Monitor") {
    return "Recent fail. Check whether the swimmer needs extra support before the next assessment.";
  }

  if (status === "Ready to advance") {
    return "Passed the recent assessment. Confirm next level movement.";
  }

  if (status === "Due for assessment") {
    return "No clear recent pass/fail result. Confirm assessment status.";
  }

  return "Continue current class focus.";
}

function getPassBadgeClass(quarter?: AssessmentQuarter) {
  const shadeIndex = getQuarterShadeIndex(quarter);

  if (shadeIndex >= 2) {
    return "border-green-300 bg-green-50 text-green-700";
  }

  if (shadeIndex === 1) {
    return "border-green-400/50 bg-green-100 text-green-700";
  }

  return "border-green-500/40 bg-green-100 text-green-800";
}

function getFailBadgeClass(quarter?: AssessmentQuarter) {
  const shadeIndex = getQuarterShadeIndex(quarter);

  if (shadeIndex >= 2) {
    return "border-red-300 bg-red-50 text-red-700";
  }

  if (shadeIndex === 1) {
    return "border-red-400/50 bg-red-100 text-red-700";
  }

  return "border-red-500/40 bg-red-100 text-red-800";
}

function getQuarterShadeIndex(quarter?: AssessmentQuarter) {
  const match = quarter?.match(/^Q(\d+)$/);
  return match ? Math.max(Number(match[1]) - 1, 0) : 0;
}
