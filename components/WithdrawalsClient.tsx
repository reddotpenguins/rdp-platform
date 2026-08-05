"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Inbox,
  PauseCircle,
  RotateCcw,
  Save,
  Search,
  UserMinus,
  Users,
  type LucideIcon
} from "lucide-react";
import {
  createStudentLifecycleAction,
  updateStudentLifecycleAction
} from "@/app/withdrawals/actions";
import { SignOutButton } from "@/components/SignOutButton";
import type { CentreFilterAccess } from "@/lib/staffRoles";
import type { StudentLifecycleStatus, StudentProfile } from "@/types/studentLifecycle";
import {
  formatStudentLifecycleStatus,
  studentLifecycleStatuses
} from "@/types/studentLifecycle";

type WithdrawalsClientProps = {
  centreFilterAccess: CentreFilterAccess;
  dataError?: string;
  errorMessage?: string;
  savedMessage?: string;
  students: StudentProfile[];
};

type StatusFilter = "All" | StudentLifecycleStatus;

const dateFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium"
});

export function WithdrawalsClient({
  centreFilterAccess,
  dataError,
  errorMessage,
  savedMessage,
  students
}: WithdrawalsClientProps) {
  const centreOptions = useMemo(
    () => getCentreOptions(students, centreFilterAccess.centres),
    [centreFilterAccess.centres, students]
  );
  const defaultCentre =
    !centreFilterAccess.allowAllCentres && centreOptions.length === 1 ? centreOptions[0] : "";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [centreFilter, setCentreFilter] = useState(defaultCentre || "All");

  const visibleStudents = useMemo(
    () =>
      filterStudents(students, {
        centre: centreFilter,
        search,
        status: statusFilter
      }),
    [centreFilter, search, statusFilter, students]
  );
  const totals = useMemo(
    () => ({
      active: students.filter((student) => student.status === "active").length,
      frozen: students.filter((student) => student.status === "frozen").length,
      withdrawn: students.filter((student) => student.status === "withdrawn").length,
      totalCurrent: students.filter((student) => student.status !== "withdrawn").length
    }),
    [students]
  );

  function resetFilters() {
    setSearch("");
    setStatusFilter("All");
    setCentreFilter(defaultCentre || "All");
  }

  return (
    <main className="mx-auto flex min-w-0 w-full max-w-[1500px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex min-w-0 flex-col gap-4 rounded-lg border border-line bg-paper p-4 shadow-panel lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase text-teal">Red Dot Penguins</p>
          <h1 className="mt-1 break-words text-2xl font-semibold text-ink sm:text-3xl">
            Withdrawals and Freeze
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:w-auto">
          <HeaderLink href="/dashboard" icon={ArrowLeft} label="Dashboard" />
          <HeaderLink href="/students" icon={Users} label="Students" />
          <HeaderLink href="/enquiries" icon={Inbox} label="Enquiries" />
          <SignOutButton className="flex-1 sm:flex-none" />
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <MetricCard icon={Users} label="Total current" value={totals.totalCurrent} />
        <MetricCard icon={CheckCircle2} label="Active" value={totals.active} />
        <MetricCard icon={PauseCircle} label="On freeze" value={totals.frozen} />
        <MetricCard icon={UserMinus} label="Withdrawn" value={totals.withdrawn} />
      </section>

      {savedMessage ? (
        <StatusMessage tone="success" message={savedMessage} />
      ) : errorMessage ? (
        <StatusMessage tone="error" message={errorMessage} />
      ) : dataError ? (
        <StatusMessage
          tone="error"
          message={`${dataError}. Run the latest Supabase SQL setup before using this page.`}
        />
      ) : null}

      <section className="rounded-lg border border-line bg-paper p-4 shadow-panel">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-teal/10 text-teal">
            <UserMinus aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-ink">Record student status</h2>
            <p className="text-sm text-slate-500">
              Add withdrawals, freeze periods, or reactivated students.
            </p>
          </div>
        </div>

        <form action={createStudentLifecycleAction} className="mt-4 grid gap-3 xl:grid-cols-6">
          <TextField label="Student name" name="studentName" required />
          <TextField label="Parent name" name="parentName" />
          <TextField label="Phone" name="phone" />
          <CentreField
            centreFilterAccess={centreFilterAccess}
            defaultValue={defaultCentre}
            options={centreOptions}
          />
          <TextField label="Coach" name="coachName" />
          <TextField label="Programme" name="programme" />
          <TextField label="Start date" name="startDate" type="date" />
          <TextField label="Effective date" name="statusEffectiveDate" type="date" />
          <TextField className="xl:col-span-2" label="Reason" name="reason" />
          <div className="xl:col-span-2">
            <StatusPicker defaultValue="withdrawn" />
          </div>
          <TextareaField className="xl:col-span-5" label="Notes" name="notes" rows={2} />
          <div className="flex items-end">
            <SubmitButton label="Add record" />
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-line bg-paper p-4 shadow-panel">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_180px_auto] lg:items-end">
          <label className="relative block">
            <span className="mb-1 block text-sm font-medium text-slate-600">Search students</span>
            <Search aria-hidden="true" className="absolute bottom-3 left-3 size-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-10 w-full rounded-md border border-line bg-field pl-9 pr-3 text-sm outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
              placeholder="Student, parent, phone, coach"
            />
          </label>

          <SelectField
            label="Status"
            value={statusFilter}
            values={["All", ...studentLifecycleStatuses]}
            labelForValue={(value) =>
              value === "All" ? "All statuses" : formatStudentLifecycleStatus(value)
            }
            onChange={setStatusFilter}
          />

          <SelectField
            label="Centre"
            value={centreFilter}
            values={["All", ...centreOptions]}
            labelForValue={(value) => (value === "All" ? "All centres" : value)}
            onChange={setCentreFilter}
          />

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

      <section className="rounded-lg border border-line bg-paper shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Student status records</h2>
            <p className="text-sm text-slate-500">
              {visibleStudents.length.toLocaleString()} records shown
            </p>
          </div>
        </div>

        <div className="max-h-[760px] overflow-y-auto bg-field p-3">
          {visibleStudents.length > 0 ? (
            <div className="space-y-3">
              {visibleStudents.map((student) => (
                <StudentStatusCard
                  centreFilterAccess={centreFilterAccess}
                  centreOptions={centreOptions}
                  key={student.id}
                  student={student}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-line bg-paper px-4 py-8 text-center text-sm text-slate-500">
              No student records match these filters.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function StudentStatusCard({
  centreFilterAccess,
  centreOptions,
  student
}: {
  centreFilterAccess: CentreFilterAccess;
  centreOptions: string[];
  student: StudentProfile;
}) {
  return (
    <article className="overflow-hidden rounded-lg border border-line bg-paper shadow-sm">
      <div className={`border-l-4 ${getStatusAccentClass(student.status)} p-4`}>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)]">
          <section className="min-w-0">
            <div className="flex flex-wrap items-start gap-2">
              <h3 className="min-w-0 flex-1 break-words text-base font-semibold text-ink">
                {student.studentName}
              </h3>
              <StatusPill status={student.status} />
            </div>
            <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
              <ReadLine label="Parent" value={student.parentName || "-"} />
              <ReadLine label="Phone" value={student.phone || "-"} />
              <ReadLine label="Centre" value={student.centreName || "-"} />
              <ReadLine label="Coach" value={student.coachName || "-"} />
              <ReadLine label="Effective" value={formatDate(student.statusEffectiveDate)} />
              <ReadLine label="Reason" value={student.reason || "-"} />
            </div>
          </section>

          <form action={updateStudentLifecycleAction} className="grid gap-3 lg:grid-cols-4">
            <input name="studentId" type="hidden" value={student.id} />
            <TextField defaultValue={student.studentName} label="Student" name="studentName" required />
            <TextField defaultValue={student.parentName ?? ""} label="Parent" name="parentName" />
            <TextField defaultValue={student.phone ?? ""} label="Phone" name="phone" />
            <CentreField
              centreFilterAccess={centreFilterAccess}
              defaultValue={student.centreName ?? ""}
              options={centreOptions}
            />
            <TextField defaultValue={student.coachName ?? ""} label="Coach" name="coachName" />
            <TextField defaultValue={student.programme ?? ""} label="Programme" name="programme" />
            <TextField
              defaultValue={dateInputValue(student.startDate)}
              label="Start date"
              name="startDate"
              type="date"
            />
            <TextField
              defaultValue={dateInputValue(student.statusEffectiveDate)}
              label="Effective"
              name="statusEffectiveDate"
              type="date"
            />
            <SelectField
              label="Status"
              value={student.status}
              values={studentLifecycleStatuses}
              labelForValue={formatStudentLifecycleStatus}
              name="status"
            />
            <TextField
              className="lg:col-span-2"
              defaultValue={student.reason ?? ""}
              label="Reason"
              name="reason"
            />
            <div className="flex items-end">
              <SubmitButton label="Save" />
            </div>
            <TextareaField
              className="lg:col-span-4"
              defaultValue={student.notes ?? ""}
              label="Notes"
              name="notes"
              rows={2}
            />
          </form>
        </div>
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

function StatusPicker({ defaultValue }: { defaultValue: StudentLifecycleStatus }) {
  return (
    <fieldset>
      <legend className="mb-1 block text-xs font-medium uppercase text-slate-500">Status</legend>
      <div className="grid grid-cols-3 rounded-md border border-line bg-field p-1">
        {studentLifecycleStatuses.map((status) => (
          <label
            key={status}
            className="has-[:checked]:bg-teal has-[:checked]:text-white rounded px-2 py-2 text-center text-sm font-semibold text-slate-600 transition"
          >
            <input
              className="sr-only"
              defaultChecked={status === defaultValue}
              name="status"
              type="radio"
              value={status}
            />
            {formatStudentLifecycleStatus(status)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function CentreField({
  centreFilterAccess,
  defaultValue = "",
  options
}: {
  centreFilterAccess: CentreFilterAccess;
  defaultValue?: string;
  options: string[];
}) {
  if (!centreFilterAccess.allowAllCentres && options.length > 0) {
    return (
      <SelectField
        label="Centre"
        name="centreName"
        value={defaultValue || options[0]}
        values={options}
      />
    );
  }

  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase text-slate-500">Centre</span>
      <input
        className="h-9 w-full rounded-md border border-line bg-field px-2 text-sm outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
        defaultValue={defaultValue}
        list="withdrawal-centre-options"
        name="centreName"
        placeholder="SJII"
      />
      <datalist id="withdrawal-centre-options">
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </label>
  );
}

function SelectField<TValue extends string>({
  label,
  labelForValue = (option) => option,
  name,
  onChange,
  value,
  values
}: {
  label: string;
  labelForValue?: (value: TValue) => string;
  name?: string;
  onChange?: (value: TValue) => void;
  value: TValue;
  values: TValue[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase text-slate-500">{label}</span>
      <select
        className="h-9 w-full rounded-md border border-line bg-field px-2 text-sm outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
        defaultValue={onChange ? undefined : value}
        name={name}
        onChange={onChange ? (event) => onChange(event.target.value as TValue) : undefined}
        value={onChange ? value : undefined}
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

function TextField({
  className = "",
  defaultValue,
  label,
  name,
  required = false,
  type = "text"
}: {
  className?: string;
  defaultValue?: string;
  label: string;
  name: string;
  required?: boolean;
  type?: "date" | "email" | "text";
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium uppercase text-slate-500">{label}</span>
      <input
        className="h-9 w-full rounded-md border border-line bg-field px-2 text-sm outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
        defaultValue={defaultValue}
        name={name}
        required={required}
        type={type}
      />
    </label>
  );
}

function TextareaField({
  className = "",
  defaultValue,
  label,
  name,
  rows
}: {
  className?: string;
  defaultValue?: string;
  label: string;
  name: string;
  rows: number;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium uppercase text-slate-500">{label}</span>
      <textarea
        className="w-full rounded-md border border-line bg-field px-2 py-2 text-sm outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
        defaultValue={defaultValue}
        name={name}
        rows={rows}
      />
    </label>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-teal px-3 text-sm font-semibold text-white transition hover:bg-teal/90 disabled:cursor-wait disabled:opacity-70"
      disabled={pending}
      type="submit"
    >
      <Save aria-hidden="true" className="size-4" />
      {pending ? "Saving..." : label}
    </button>
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

function StatusMessage({ tone, message }: { tone: "success" | "error"; message: string }) {
  const isSuccess = tone === "success";

  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm font-medium ${
        isSuccess
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      {message}
    </div>
  );
}

function StatusPill({ status }: { status: StudentLifecycleStatus }) {
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

function getCentreOptions(students: StudentProfile[], assignedCentres: string[]) {
  return Array.from(
    new Set(
      [...assignedCentres, ...students.map((student) => student.centreName ?? "")]
        .map((centre) => centre.trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
}

function filterStudents(
  students: StudentProfile[],
  filters: {
    centre: string;
    search: string;
    status: StatusFilter;
  }
) {
  const search = filters.search.trim().toLowerCase();

  return students.filter((student) => {
    const matchesSearch =
      !search ||
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
        .some((value) => value?.toLowerCase().includes(search));
    const matchesStatus = filters.status === "All" || student.status === filters.status;
    const matchesCentre =
      filters.centre === "All" ||
      student.centreName?.trim().toLowerCase() === filters.centre.trim().toLowerCase();

    return matchesSearch && matchesStatus && matchesCentre;
  });
}

function getStatusAccentClass(status: StudentLifecycleStatus) {
  if (status === "active") {
    return "border-l-emerald-500";
  }

  if (status === "frozen") {
    return "border-l-cyan-500";
  }

  return "border-l-rose-500";
}

function dateInputValue(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return dateFormatter.format(new Date(`${value}T00:00:00+08:00`));
}
