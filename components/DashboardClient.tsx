"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Database, FileUp, RefreshCcw } from "lucide-react";
import { AssessmentCharts } from "@/components/AssessmentCharts";
import { CoachSummaryTable } from "@/components/CoachSummaryTable";
import { Filters } from "@/components/Filters";
import { QuarterStudentTable } from "@/components/QuarterStudentTable";
import { QuarterSummaryTable } from "@/components/QuarterSummaryTable";
import { SignOutButton } from "@/components/SignOutButton";
import { StudentFlagTable } from "@/components/StudentFlagTable";
import {
  calculateCoachSummaries,
  calculateQuarterSummaries,
  calculateDashboardMetrics,
  emptyFilters,
  filterQuarterRows,
  filterRecords,
  getFilterOptions,
  toQuarterAssessmentRows
} from "@/lib/assessmentLogic";
import type {
  AssessmentFilters,
  AssessmentResult,
  StudentAssessmentRecord
} from "@/types/assessment";

type DashboardClientProps = {
  initialRecords: StudentAssessmentRecord[];
  defaultDatasetName: string;
  initialImportedAt?: string | null;
  view?: "coach" | "quarter";
};

export function DashboardClient({
  initialRecords,
  defaultDatasetName,
  initialImportedAt = null,
  view = "coach"
}: DashboardClientProps) {
  const router = useRouter();
  const [records, setRecords] = useState(initialRecords);
  const [datasetLabel, setDatasetLabel] = useState(defaultDatasetName);
  const [importedAt, setImportedAt] = useState<string | null>(initialImportedAt);
  const [filters, setFilters] = useState<AssessmentFilters>(emptyFilters);

  useEffect(() => {
    setRecords(initialRecords);
    setDatasetLabel(defaultDatasetName);
    setImportedAt(initialImportedAt);
  }, [defaultDatasetName, initialImportedAt, initialRecords]);

  useEffect(() => {
    setFilters((currentFilters) => {
      const currentOptions = getFilterOptions(records, currentFilters.quarter);
      return sanitizeFiltersForOptions(currentFilters, currentOptions);
    });
  }, [records, filters.quarter]);

  const filteredRecords = useMemo(() => filterRecords(records, filters), [filters, records]);
  const metrics = useMemo(() => calculateDashboardMetrics(filteredRecords), [filteredRecords]);
  const coachSummaries = useMemo(
    () => calculateCoachSummaries(filteredRecords, filters.quarter),
    [filteredRecords, filters.quarter]
  );
  const quarterRows = useMemo(
    () => filterQuarterRows(toQuarterAssessmentRows(records), filters),
    [filters, records]
  );
  const quarterSummaries = useMemo(() => calculateQuarterSummaries(quarterRows), [quarterRows]);
  const filterOptions = useMemo(
    () => getFilterOptions(records, filters.quarter),
    [filters.quarter, records]
  );

  function refreshDataset() {
    setRecords(initialRecords);
    setDatasetLabel(defaultDatasetName);
    setImportedAt(initialImportedAt);
    setFilters(emptyFilters);
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-w-0 w-full max-w-[1500px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex min-w-0 flex-col gap-4 rounded-lg border border-line bg-paper p-4 shadow-panel lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase text-teal">Red Dot Penguins</p>
          <h1 className="mt-1 break-words text-2xl font-semibold text-ink sm:text-3xl">
            {view === "coach" ? "Coach Assessment Dashboard" : "Quarter Assessment Dashboard"}
          </h1>
          <div className="mt-3 flex min-w-0 flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:flex-wrap sm:items-center">
            <span className="inline-flex max-w-full min-w-0 items-center gap-2 rounded-md border border-line bg-field px-2.5 py-1">
              <Database aria-hidden="true" className="size-4 text-teal" />
              <span className="truncate">{datasetLabel}</span>
            </span>
            <span>{records.length.toLocaleString()} rows loaded</span>
            {importedAt ? <span>Imported {new Date(importedAt).toLocaleString()}</span> : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:w-auto">
          <Link
            href="/upload"
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-teal px-3 text-sm font-semibold text-white transition hover:bg-teal/90 sm:flex-none"
          >
            <FileUp aria-hidden="true" className="size-4" />
            Upload data
          </Link>
          <button
            type="button"
            onClick={refreshDataset}
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal sm:flex-none"
          >
            <RefreshCcw aria-hidden="true" className="size-4" />
            Refresh data
          </button>
          <SignOutButton className="flex-1 sm:flex-none" />
        </div>
      </header>

      <nav className="flex flex-wrap gap-2 rounded-lg border border-line bg-paper p-2 shadow-panel">
        <ViewLink active={view === "coach"} href="/dashboard" label="Coach assessment" />
        <ViewLink
          active={view === "quarter"}
          href="/dashboard/quarter"
          label="Quarter assessment"
        />
      </nav>

      <Filters
        filters={filters}
        options={filterOptions}
        onChange={setFilters}
        onReset={() => setFilters(emptyFilters)}
      />

      {view === "coach" ? (
        <>
          <AssessmentCharts
            metrics={metrics}
            coachSummaries={coachSummaries}
            selectedQuarter={filters.quarter}
          />
          <CoachSummaryTable summaries={coachSummaries} selectedQuarter={filters.quarter} />
          <StudentFlagTable records={filteredRecords} selectedQuarter={filters.quarter} />
        </>
      ) : (
        <>
          <QuarterSummaryTable summaries={quarterSummaries} />
          <QuarterStudentTable rows={quarterRows} />
        </>
      )}
    </main>
  );
}

function sanitizeFiltersForOptions(filters: AssessmentFilters, options: ReturnType<typeof getFilterOptions>) {
  const nextFilters: AssessmentFilters = { ...filters };

  if (nextFilters.coach !== "All" && !options.coaches.includes(nextFilters.coach)) {
    nextFilters.coach = "All";
  }

  if (nextFilters.centre !== "All" && !options.centres.includes(nextFilters.centre)) {
    nextFilters.centre = "All";
  }

  if (nextFilters.level !== "All" && !options.levels.includes(nextFilters.level)) {
    nextFilters.level = "All";
  }

  if (nextFilters.session !== "All" && !options.sessions.includes(nextFilters.session)) {
    nextFilters.session = "All";
  }

  if (
    nextFilters.result !== "All" &&
    !options.results.includes(nextFilters.result as AssessmentResult)
  ) {
    nextFilters.result = "All";
  }

  return filtersAreEqual(filters, nextFilters) ? filters : nextFilters;
}

function filtersAreEqual(first: AssessmentFilters, second: AssessmentFilters) {
  return (
    first.search === second.search &&
    first.coach === second.coach &&
    first.centre === second.centre &&
    first.level === second.level &&
    first.session === second.session &&
    first.flag === second.flag &&
    first.quarter === second.quarter &&
    first.result === second.result
  );
}

function ViewLink({ active, href, label }: { active: boolean; href: string; label: string }) {
  return (
    <Link
      href={href}
      className={`inline-flex h-9 items-center rounded-md px-3 text-sm font-semibold transition ${
        active ? "bg-teal text-white" : "text-slate-700 hover:bg-teal/10 hover:text-teal"
      }`}
    >
      {label}
    </Link>
  );
}
