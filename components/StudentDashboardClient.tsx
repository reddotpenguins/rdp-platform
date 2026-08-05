"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Inbox,
  PauseCircle,
  RotateCcw,
  Search,
  TrendingUp,
  UserMinus,
  UserPlus,
  Users,
  type LucideIcon
} from "lucide-react";
import { SignOutButton } from "@/components/SignOutButton";
import type { CentreFilterAccess } from "@/lib/staffRoles";
import type { CustomerEnquiry } from "@/types/enquiry";
import type { StudentProfile } from "@/types/studentLifecycle";
import { formatStudentLifecycleStatus } from "@/types/studentLifecycle";

type StudentDashboardClientProps = {
  centreFilterAccess: CentreFilterAccess;
  enquiries: CustomerEnquiry[];
  enquiriesError?: string;
  students: StudentProfile[];
  studentsError?: string;
};

const dateFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium"
});

export function StudentDashboardClient({
  centreFilterAccess,
  enquiries,
  enquiriesError,
  students,
  studentsError
}: StudentDashboardClientProps) {
  const centreOptions = useMemo(
    () => getCentreOptions(students, enquiries, centreFilterAccess.centres),
    [centreFilterAccess.centres, enquiries, students]
  );
  const defaultCentre =
    !centreFilterAccess.allowAllCentres && centreOptions.length === 1 ? centreOptions[0] : "All";
  const [centreFilter, setCentreFilter] = useState(defaultCentre);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filteredStudents = useMemo(
    () => filterStudentsByCentreAndSearch(students, centreFilter, search),
    [centreFilter, search, students]
  );
  const filteredSignUps = useMemo(
    () =>
      enquiries.filter(
        (enquiry) =>
          isSignUp(enquiry) &&
          matchesCentre(getEnquiryCentre(enquiry), centreFilter) &&
          matchesDateRange(getSignUpDate(enquiry), dateFrom, dateTo)
      ),
    [centreFilter, dateFrom, dateTo, enquiries]
  );
  const filteredWithdrawals = useMemo(
    () =>
      filteredStudents.filter(
        (student) =>
          student.status === "withdrawn" &&
          matchesDateRange(student.statusEffectiveDate, dateFrom, dateTo)
      ),
    [dateFrom, dateTo, filteredStudents]
  );
  const filteredFrozen = useMemo(
    () => filteredStudents.filter((student) => student.status === "frozen"),
    [filteredStudents]
  );
  const filteredActive = useMemo(
    () => filteredStudents.filter((student) => student.status === "active"),
    [filteredStudents]
  );
  const currentStudents = filteredStudents.filter((student) => student.status !== "withdrawn");

  function resetFilters() {
    setCentreFilter(defaultCentre);
    setSearch("");
    setDateFrom("");
    setDateTo("");
  }

  return (
    <main className="mx-auto flex min-w-0 w-full max-w-[1500px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex min-w-0 flex-col gap-4 rounded-lg border border-line bg-paper p-4 shadow-panel lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase text-teal">Red Dot Penguins</p>
          <h1 className="mt-1 break-words text-2xl font-semibold text-ink sm:text-3xl">
            Student Growth Dashboard
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:w-auto">
          <HeaderLink href="/dashboard" icon={ArrowLeft} label="Dashboard" />
          <HeaderLink href="/withdrawals" icon={UserMinus} label="Withdrawals" />
          <HeaderLink href="/enquiries" icon={Inbox} label="Enquiries" />
          <SignOutButton className="flex-1 sm:flex-none" />
        </div>
      </header>

      {studentsError || enquiriesError ? (
        <StatusMessage
          message={`${studentsError ?? enquiriesError}. Run the latest Supabase SQL setup before using this page.`}
        />
      ) : null}

      <section className="rounded-lg border border-line bg-paper p-4 shadow-panel">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_180px_170px_170px_auto] xl:items-end">
          <label className="relative block">
            <span className="mb-1 block text-sm font-medium text-slate-600">Search roster</span>
            <Search aria-hidden="true" className="absolute bottom-3 left-3 size-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-10 w-full rounded-md border border-line bg-field pl-9 pr-3 text-sm outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
              placeholder="Student, parent, coach, programme"
            />
          </label>

          <SelectField
            label="Centre"
            value={centreFilter}
            values={["All", ...centreOptions]}
            labelForValue={(value) => (value === "All" ? "All centres" : value)}
            onChange={setCentreFilter}
          />

          <DateField label="From" value={dateFrom} onChange={setDateFrom} />
          <DateField label="To" value={dateTo} onChange={setDateTo} />

          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal"
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            Reset
          </button>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={UserPlus} label="Sign ups" value={filteredSignUps.length} />
        <MetricCard icon={UserMinus} label="Withdrawals" value={filteredWithdrawals.length} />
        <MetricCard icon={Users} label="Total current" value={currentStudents.length} />
        <MetricCard icon={CheckCircle2} label="Active" value={filteredActive.length} />
        <MetricCard icon={PauseCircle} label="On freeze" value={filteredFrozen.length} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <MovementPanel
          emptyText="No sign ups match this period."
          icon={TrendingUp}
          rows={filteredSignUps.slice(0, 12).map((enquiry) => ({
            centre: getEnquiryCentre(enquiry) || "-",
            date: formatDate(getSignUpDate(enquiry)),
            detail: enquiry.signedUpCoach || enquiry.trialCoach || enquiry.assignedTo || "-",
            id: enquiry.id,
            name: enquiry.childName || enquiry.parentName,
            status: "Sign up"
          }))}
          title="Recent sign ups"
        />
        <MovementPanel
          emptyText="No withdrawals match this period."
          icon={UserMinus}
          rows={filteredWithdrawals.slice(0, 12).map((student) => ({
            centre: student.centreName || "-",
            date: formatDate(student.statusEffectiveDate),
            detail: student.reason || "-",
            id: student.id,
            name: student.studentName,
            status: formatStudentLifecycleStatus(student.status)
          }))}
          title="Recent withdrawals"
        />
      </section>

      <section className="rounded-lg border border-line bg-paper shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Current roster</h2>
            <p className="text-sm text-slate-500">
              {currentStudents.length.toLocaleString()} active or frozen students shown
            </p>
          </div>
        </div>
        <div className="max-h-[580px] overflow-y-auto bg-field p-3">
          {currentStudents.length > 0 ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {currentStudents.map((student) => (
                <RosterCard key={student.id} student={student} />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-line bg-paper px-4 py-8 text-center text-sm text-slate-500">
              No current students match these filters.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function MovementPanel({
  emptyText,
  icon: Icon,
  rows,
  title
}: {
  emptyText: string;
  icon: LucideIcon;
  rows: Array<{
    centre: string;
    date: string;
    detail: string;
    id: string;
    name: string;
    status: string;
  }>;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-line bg-paper shadow-panel">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <span className="flex size-9 items-center justify-center rounded-lg bg-teal/10 text-teal">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
      </div>
      <div className="divide-y divide-line">
        {rows.length > 0 ? (
          rows.map((row) => (
            <div
              className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_140px_120px]"
              key={row.id}
            >
              <div className="min-w-0">
                <p className="break-words font-semibold text-ink">{row.name}</p>
                <p className="mt-1 break-words text-slate-500">{row.detail}</p>
              </div>
              <div className="text-slate-600">{row.centre}</div>
              <div>
                <p className="font-medium text-slate-700">{row.status}</p>
                <p className="text-slate-500">{row.date}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="px-4 py-8 text-center text-sm text-slate-500">{emptyText}</div>
        )}
      </div>
    </section>
  );
}

function RosterCard({ student }: { student: StudentProfile }) {
  return (
    <article className="rounded-lg border border-line bg-paper p-4 shadow-sm">
      <div className="flex flex-wrap items-start gap-2">
        <h3 className="min-w-0 flex-1 break-words text-base font-semibold text-ink">
          {student.studentName}
        </h3>
        <StatusPill status={student.status} />
      </div>
      <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
        <ReadLine label="Centre" value={student.centreName || "-"} />
        <ReadLine label="Coach" value={student.coachName || "-"} />
        <ReadLine label="Parent" value={student.parentName || "-"} />
        <ReadLine label="Phone" value={student.phone || "-"} />
      </div>
    </article>
  );
}

function HeaderLink({
  href,
  icon: Icon,
  label
}: {
  href: string;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal sm:flex-none"
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </Link>
  );
}

function SelectField<TValue extends string>({
  label,
  labelForValue = (option) => option,
  onChange,
  value,
  values
}: {
  label: string;
  labelForValue?: (value: TValue) => string;
  onChange: (value: TValue) => void;
  value: TValue;
  values: TValue[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      <select
        className="h-10 w-full rounded-md border border-line bg-field px-3 text-sm outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
        onChange={(event) => onChange(event.target.value as TValue)}
        value={value}
      >
        {values.map((option) => (
          <option key={`${label}-${option}`} value={option}>
            {labelForValue(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function DateField({
  label,
  onChange,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      <input
        className="h-10 w-full rounded-md border border-line bg-field px-3 text-sm outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
        onChange={(event) => onChange(event.target.value)}
        type="date"
        value={value}
      />
    </label>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value
}: {
  icon: LucideIcon;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border border-line bg-paper p-4 shadow-panel">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        <span className="flex size-9 items-center justify-center rounded-lg bg-teal/10 text-teal">
          <Icon aria-hidden="true" className="size-5" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-ink">{value.toLocaleString()}</p>
    </div>
  );
}

function StatusMessage({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
      {message}
    </div>
  );
}

function StatusPill({ status }: { status: StudentProfile["status"] }) {
  const classes =
    status === "active"
      ? "bg-emerald-100 text-emerald-700"
      : status === "frozen"
        ? "bg-cyan-100 text-cyan-700"
        : "bg-rose-100 text-rose-700";

  return (
    <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${classes}`}>
      {formatStudentLifecycleStatus(status)}
    </span>
  );
}

function ReadLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="text-xs font-semibold uppercase text-slate-500">{label}</span>
      <p className="break-words">{value}</p>
    </div>
  );
}

function getCentreOptions(
  students: StudentProfile[],
  enquiries: CustomerEnquiry[],
  assignedCentres: string[]
) {
  return Array.from(
    new Set(
      [
        ...assignedCentres,
        ...students.map((student) => student.centreName ?? ""),
        ...enquiries.map(getEnquiryCentre)
      ]
        .map((centre) => centre.trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
}

function filterStudentsByCentreAndSearch(
  students: StudentProfile[],
  centreFilter: string,
  search: string
) {
  const searchValue = search.trim().toLowerCase();

  return students.filter((student) => {
    const matchesCentre = matchesCentreFilter(student.centreName, centreFilter);
    const matchesSearch =
      !searchValue ||
      [
        student.studentName,
        student.parentName,
        student.phone,
        student.email,
        student.centreName,
        student.coachName,
        student.programme,
        student.reason,
        student.notes
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(searchValue));

    return matchesCentre && matchesSearch;
  });
}

function isSignUp(enquiry: CustomerEnquiry) {
  return Boolean(
    enquiry.status === "signed_up" ||
      enquiry.enquiryType === "sign_up" ||
      enquiry.registrationDate ||
      enquiry.signedUpLocation
  );
}

function getSignUpDate(enquiry: CustomerEnquiry) {
  return enquiry.registrationDate ?? enquiry.enquiryReceivedAt ?? enquiry.createdAt;
}

function getEnquiryCentre(enquiry: CustomerEnquiry) {
  return enquiry.signedUpLocation || enquiry.trialLocation || enquiry.centreName || "";
}

function matchesCentre(value: string, centreFilter: string) {
  return matchesCentreFilter(value, centreFilter);
}

function matchesCentreFilter(value: string | null, centreFilter: string) {
  return (
    centreFilter === "All" ||
    value?.trim().toLowerCase() === centreFilter.trim().toLowerCase()
  );
}

function matchesDateRange(value: string | null, dateFrom: string, dateTo: string) {
  if (!value) {
    return false;
  }

  const time = new Date(value.length === 10 ? `${value}T00:00:00+08:00` : value).getTime();
  const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00+08:00`).getTime() : null;
  const toTime = dateTo ? new Date(`${dateTo}T23:59:59+08:00`).getTime() : null;

  return (fromTime === null || time >= fromTime) && (toTime === null || time <= toTime);
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return dateFormatter.format(new Date(value.length === 10 ? `${value}T00:00:00+08:00` : value));
}
