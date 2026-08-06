"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { FileUp, Inbox, Receipt, RefreshCcw, ShieldCheck, UserMinus, Users } from "lucide-react";
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
import type { CentreFilterAccess } from "@/lib/staffRoles";
import type {
  AssessmentFilters,
  AssessmentResult,
  FilterOptions,
  StudentAssessmentRecord
} from "@/types/assessment";

type DashboardClientProps = {
  initialRecords: StudentAssessmentRecord[];
  canUpload: boolean;
  canManageEnquiries?: boolean;
  canManageStaff?: boolean;
  canManageStudentLifecycle?: boolean;
  canViewStudentLifecycle?: boolean;
  centreFilterAccess: CentreFilterAccess;
  view?: "coach" | "quarter";
};

export function DashboardClient({
  initialRecords,
  canUpload,
  canManageEnquiries = false,
  canManageStaff = false,
  canManageStudentLifecycle = false,
  canViewStudentLifecycle = false,
  centreFilterAccess,
  view = "coach"
}: DashboardClientProps) {
  const router = useRouter();
  const [records, setRecords] = useState(initialRecords);
  const defaultFilters = useMemo(
    () => createDefaultFilters(centreFilterAccess),
    [centreFilterAccess]
  );
  const [filters, setFilters] = useState<AssessmentFilters>(defaultFilters);

  useEffect(() => {
    setRecords(initialRecords);
  }, [initialRecords]);

  const filterOptions = useMemo(
    () =>
      applyCentreAccessToFilterOptions(
        getFilterOptions(records, filters.quarter),
        centreFilterAccess
      ),
    [centreFilterAccess, filters.quarter, records]
  );

  useEffect(() => {
    setFilters((currentFilters) => {
      return sanitizeFiltersForOptions(currentFilters, filterOptions, defaultFilters);
    });
  }, [defaultFilters, filterOptions]);

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

  function refreshDataset() {
    setRecords(initialRecords);
    setFilters(defaultFilters);
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
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:w-auto">
          {canUpload ? (
            <Link
              href="/upload"
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-teal px-3 text-sm font-semibold text-white transition hover:bg-teal/90 sm:flex-none"
            >
              <FileUp aria-hidden="true" className="size-4" />
              Upload data
            </Link>
          ) : null}
          {canManageEnquiries ? (
            <Link
              href="/enquiries"
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal sm:flex-none"
            >
              <Inbox aria-hidden="true" className="size-4" />
              Enquiries
            </Link>
          ) : null}
          {canViewStudentLifecycle ? (
            <Link
              href="/students"
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal sm:flex-none"
            >
              <Users aria-hidden="true" className="size-4" />
              Students
            </Link>
          ) : null}
          {canManageStudentLifecycle ? (
            <Link
              href="/withdrawals"
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal sm:flex-none"
            >
              <UserMinus aria-hidden="true" className="size-4" />
              Withdrawals
            </Link>
          ) : null}
          <Link
            href="/claims"
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal sm:flex-none"
          >
            <Receipt aria-hidden="true" className="size-4" />
            Claims
          </Link>
          {canManageStaff ? (
            <Link
              href="/rba"
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal sm:flex-none"
            >
              <ShieldCheck aria-hidden="true" className="size-4" />
              RBA
            </Link>
          ) : null}
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
        allowAllCentres={centreFilterAccess.allowAllCentres}
        onChange={setFilters}
        onReset={() => setFilters(defaultFilters)}
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

function createDefaultFilters(centreFilterAccess: CentreFilterAccess): AssessmentFilters {
  return {
    ...emptyFilters,
    centre: centreFilterAccess.allowAllCentres
      ? "All"
      : cleanCentreOptions(centreFilterAccess.centres)[0] ?? "All"
  };
}

function applyCentreAccessToFilterOptions(
  options: FilterOptions,
  centreFilterAccess: CentreFilterAccess
): FilterOptions {
  const accessCentres = cleanCentreOptions(centreFilterAccess.centres);

  if (!centreFilterAccess.allowAllCentres) {
    const lockedCentre = accessCentres[0];
    const matchingOption = options.centres.find((centre) =>
      centresMatch(centre, lockedCentre ?? "")
    );

    return {
      ...options,
      centres: matchingOption ? [matchingOption] : lockedCentre ? [lockedCentre] : []
    };
  }

  return {
    ...options,
    centres: mergeCentreOptions(options.centres, accessCentres)
  };
}

function cleanCentreOptions(centres: string[]) {
  return Array.from(
    new Set(
      centres
        .map((centre) => centre.trim())
        .filter((centre): centre is string => Boolean(centre))
    )
  );
}

function mergeCentreOptions(dataCentres: string[], accessCentres: string[]) {
  const optionsByCentreKey = new Map<string, string>();

  for (const centre of dataCentres) {
    optionsByCentreKey.set(normalizeCentreName(centre), centre);
  }

  for (const centre of accessCentres) {
    const key = normalizeCentreName(centre);

    if (!optionsByCentreKey.has(key)) {
      optionsByCentreKey.set(key, centre);
    }
  }

  return Array.from(optionsByCentreKey.values()).sort((a, b) => a.localeCompare(b));
}

function sanitizeFiltersForOptions(
  filters: AssessmentFilters,
  options: FilterOptions,
  defaultFilters: AssessmentFilters
) {
  const nextFilters: AssessmentFilters = { ...filters };

  if (nextFilters.coach !== "All" && !options.coaches.includes(nextFilters.coach)) {
    nextFilters.coach = "All";
  }

  if (nextFilters.centre === "All") {
    nextFilters.centre =
      defaultFilters.centre === "All" ? "All" : getFallbackCentre(options, defaultFilters);
  } else if (!options.centres.some((centre) => centresMatch(centre, nextFilters.centre))) {
    nextFilters.centre = getFallbackCentre(options, defaultFilters);
  }

  if (nextFilters.level !== "All" && !options.levels.includes(nextFilters.level)) {
    nextFilters.level = "All";
  }

  if (nextFilters.session !== "All" && !options.sessions.includes(nextFilters.session)) {
    nextFilters.session = "All";
  }

  if (nextFilters.sessionDay !== "All" && !options.sessionDays.includes(nextFilters.sessionDay)) {
    nextFilters.sessionDay = "All";
  }

  if (
    nextFilters.sessionPeriod !== "All" &&
    !options.sessionPeriods.includes(nextFilters.sessionPeriod)
  ) {
    nextFilters.sessionPeriod = "All";
  }

  if (
    nextFilters.result !== "All" &&
    !options.results.includes(nextFilters.result as AssessmentResult)
  ) {
    nextFilters.result = "All";
  }

  return filtersAreEqual(filters, nextFilters) ? filters : nextFilters;
}

function getFallbackCentre(options: FilterOptions, defaultFilters: AssessmentFilters) {
  if (defaultFilters.centre !== "All") {
    const matchingOption = options.centres.find((centre) =>
      centresMatch(centre, defaultFilters.centre)
    );
    return matchingOption ?? defaultFilters.centre;
  }

  return options.centres[0] ?? "All";
}

function centresMatch(first: string, second: string) {
  return normalizeCentreName(first) === normalizeCentreName(second);
}

function normalizeCentreName(centre: string) {
  return centre.trim().toLowerCase();
}

function filtersAreEqual(first: AssessmentFilters, second: AssessmentFilters) {
  return (
    first.search === second.search &&
    first.coach === second.coach &&
    first.centre === second.centre &&
    first.level === second.level &&
    first.session === second.session &&
    first.sessionDay === second.sessionDay &&
    first.sessionPeriod === second.sessionPeriod &&
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
