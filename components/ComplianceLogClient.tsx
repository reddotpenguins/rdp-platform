"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import clsx from "clsx";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Download,
  FileText,
  Plus,
  Search,
  ShieldCheck,
  type LucideIcon
} from "lucide-react";
import {
  createComplianceLogAction,
  updateComplianceLogStatusAction
} from "@/app/compliance/actions";
import { SignOutButton } from "@/components/SignOutButton";
import {
  complianceCategories,
  complianceSeverities,
  complianceStatuses,
  type ComplianceLogEntry,
  type ComplianceSeverity,
  type ComplianceStatus
} from "@/lib/complianceLog";
import { downloadCsv } from "@/lib/tableExport";
import type { StaffProfile } from "@/lib/staffRoles";

type ComplianceLogClientProps = {
  dataError?: string;
  entries: ComplianceLogEntry[];
  flash: {
    text: string;
    tone: "error" | "success";
  } | null;
  staffProfile: StaffProfile;
};

type ComplianceFilters = {
  category: string;
  query: string;
  severity: string;
  status: string;
};

const emptyFilters: ComplianceFilters = {
  category: "All",
  query: "",
  severity: "All",
  status: "All"
};

export function ComplianceLogClient({
  dataError,
  entries,
  flash,
  staffProfile
}: ComplianceLogClientProps) {
  const [filters, setFilters] = useState<ComplianceFilters>(emptyFilters);
  const filteredEntries = useMemo(
    () => entries.filter((entry) => entryMatchesFilters(entry, filters)),
    [entries, filters]
  );
  const metrics = useMemo(() => getComplianceMetrics(entries), [entries]);

  function exportFilteredEntries() {
    downloadCsv(
      `rdp-compliance-log-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        { header: "Logged at", value: (entry) => formatDateTime(entry.loggedAt) },
        { header: "Subject", value: (entry) => entry.subject },
        { header: "Category", value: (entry) => entry.category },
        { header: "Severity", value: (entry) => entry.severity },
        { header: "Status", value: (entry) => entry.status },
        { header: "Centre", value: (entry) => entry.centreName ?? "" },
        { header: "Details", value: (entry) => entry.details },
        { header: "Action Taken", value: (entry) => entry.actionTaken ?? "" },
        { header: "Follow-up Owner", value: (entry) => entry.followUpOwner ?? "" },
        { header: "Follow-up Due", value: (entry) => entry.followUpDueDate ?? "" },
        { header: "Created By", value: (entry) => entry.createdByName ?? "" },
        { header: "Updated At", value: (entry) => formatDateTime(entry.updatedAt) }
      ],
      filteredEntries
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex min-w-0 flex-col gap-4 rounded-lg border border-line bg-paper p-4 shadow-panel lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase text-teal">Red Dot Penguins</p>
          <h1 className="mt-1 break-words text-2xl font-semibold text-ink sm:text-3xl">
            Compliance Log
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {staffProfile.fullName} · Admin record of incidents, checks, follow-ups, and audit notes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <HeaderLink href="/admin" icon={ArrowLeft} label="Admin home" />
          <SignOutButton className="flex-1 sm:flex-none" />
        </div>
      </header>

      {dataError ? <StatusMessage message={dataError} tone="error" /> : null}
      {flash ? <StatusMessage message={flash.text} tone={flash.tone} /> : null}

      <section className="grid gap-3 md:grid-cols-4">
        <MetricCard icon={FileText} label="Total entries" value={entries.length} />
        <MetricCard icon={CalendarClock} label="Open / monitoring" value={metrics.active} />
        <MetricCard icon={ShieldCheck} label="High priority" value={metrics.highPriority} />
        <MetricCard icon={CheckCircle2} label="Resolved" value={metrics.resolved} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <ComplianceEntryForm disabled={Boolean(dataError)} />

        <div className="flex min-w-0 flex-col gap-4">
          <section className="rounded-lg border border-line bg-paper p-4 shadow-panel">
            <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.2fr)_repeat(3,minmax(140px,0.8fr))_auto]">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-600">Search</span>
                <span className="flex h-10 items-center gap-2 rounded-md border border-line bg-field px-3">
                  <Search aria-hidden="true" className="size-4 text-slate-400" />
                  <input
                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, query: event.target.value }))
                    }
                    placeholder="Subject, details, owner"
                    value={filters.query}
                  />
                </span>
              </label>
              <SelectField
                label="Category"
                onChange={(category) => setFilters((current) => ({ ...current, category }))}
                options={["All", ...complianceCategories]}
                value={filters.category}
              />
              <SelectField
                label="Severity"
                onChange={(severity) => setFilters((current) => ({ ...current, severity }))}
                options={["All", ...complianceSeverities]}
                value={filters.severity}
              />
              <SelectField
                label="Status"
                onChange={(status) => setFilters((current) => ({ ...current, status }))}
                options={["All", ...complianceStatuses]}
                value={filters.status}
              />
              <button
                type="button"
                onClick={exportFilteredEntries}
                className="mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal"
              >
                <Download aria-hidden="true" className="size-4" />
                Export
              </button>
            </div>
          </section>

          <ComplianceEntryList entries={filteredEntries} />
        </div>
      </section>
    </main>
  );
}

function ComplianceEntryForm({ disabled }: { disabled: boolean }) {
  return (
    <section className="rounded-lg border border-line bg-paper p-4 shadow-panel">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-teal/10 text-teal">
          <Plus aria-hidden="true" className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-ink">New log entry</h2>
          <p className="text-sm text-slate-500">Use this instead of the notepad record.</p>
        </div>
      </div>

      <form action={createComplianceLogAction} className="mt-4 grid gap-3">
        <InputField disabled={disabled} label="Subject" name="subject" required />
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            disabled={disabled}
            label="Category"
            name="category"
            options={complianceCategories}
            value="Operations"
          />
          <SelectField
            disabled={disabled}
            label="Severity"
            name="severity"
            options={complianceSeverities}
            value="Medium"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            disabled={disabled}
            label="Status"
            name="status"
            options={complianceStatuses}
            value="Open"
          />
          <InputField disabled={disabled} label="Centre" name="centreName" placeholder="Optional" />
        </div>
        <InputField
          disabled={disabled}
          label="Logged date/time"
          name="loggedAt"
          type="datetime-local"
        />
        <TextAreaField disabled={disabled} label="Details" name="details" required rows={5} />
        <TextAreaField disabled={disabled} label="Action taken" name="actionTaken" rows={3} />
        <div className="grid gap-3 sm:grid-cols-2">
          <InputField
            disabled={disabled}
            label="Follow-up owner"
            name="followUpOwner"
            placeholder="Optional"
          />
          <InputField disabled={disabled} label="Follow-up due" name="followUpDueDate" type="date" />
        </div>
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex h-10 items-center justify-center rounded-md bg-teal px-4 text-sm font-semibold text-white transition hover:bg-teal/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Add entry
        </button>
      </form>
    </section>
  );
}

function ComplianceEntryList({ entries }: { entries: ComplianceLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <section className="rounded-lg border border-line bg-paper p-5 text-sm text-slate-600 shadow-panel">
        No compliance log entries match the current filters.
      </section>
    );
  }

  return (
    <section className="grid gap-3">
      {entries.map((entry) => (
        <article key={entry.id} className="rounded-lg border border-line bg-paper p-4 shadow-panel">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <SeverityPill severity={entry.severity} />
                <StatusPill status={entry.status} />
                <span className="rounded-full bg-field px-2 py-1 text-xs font-semibold text-slate-600">
                  {entry.category}
                </span>
                {entry.centreName ? (
                  <span className="rounded-full bg-field px-2 py-1 text-xs font-semibold text-slate-600">
                    {entry.centreName}
                  </span>
                ) : null}
              </div>
              <h2 className="mt-3 break-words text-lg font-semibold text-ink">{entry.subject}</h2>
              <p className="mt-1 text-xs font-medium text-slate-500">
                Logged {formatDateTime(entry.loggedAt)}
                {entry.createdByName ? ` by ${entry.createdByName}` : ""}
              </p>
            </div>
            <p className="text-xs font-medium text-slate-500">
              Updated {formatDateTime(entry.updatedAt)}
            </p>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <InfoBlock label="Details" value={entry.details} />
            <InfoBlock label="Action taken" value={entry.actionTaken || "No action recorded yet."} />
          </div>

          <div className="mt-4 grid gap-3 rounded-lg border border-line bg-field p-3 lg:grid-cols-[1fr_1fr_1fr_auto]">
            <InfoBlock label="Follow-up owner" value={entry.followUpOwner || "-"} compact />
            <InfoBlock
              label="Follow-up due"
              value={entry.followUpDueDate ? formatDate(entry.followUpDueDate) : "-"}
              compact
            />
            <InfoBlock
              label="Resolved"
              value={entry.resolvedAt ? formatDateTime(entry.resolvedAt) : "-"}
              compact
            />
            <details className="min-w-44">
              <summary className="inline-flex h-10 w-full cursor-pointer list-none items-center justify-center rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal [&::-webkit-details-marker]:hidden">
                Update
              </summary>
              <form action={updateComplianceLogStatusAction} className="mt-3 grid gap-2">
                <input name="entryId" type="hidden" value={entry.id} />
                <SelectField
                  label="Status"
                  name="status"
                  options={complianceStatuses}
                  value={entry.status}
                />
                <InputField
                  label="Follow-up owner"
                  name="followUpOwner"
                  defaultValue={entry.followUpOwner ?? ""}
                />
                <InputField
                  label="Follow-up due"
                  name="followUpDueDate"
                  type="date"
                  defaultValue={entry.followUpDueDate ?? ""}
                />
                <TextAreaField
                  label="Action taken"
                  name="actionTaken"
                  defaultValue={entry.actionTaken ?? ""}
                  rows={3}
                />
                <button
                  type="submit"
                  className="inline-flex h-9 items-center justify-center rounded-md bg-teal px-3 text-sm font-semibold text-white transition hover:bg-teal/90"
                >
                  Save update
                </button>
              </form>
            </details>
          </div>
        </article>
      ))}
    </section>
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
    <section className="rounded-lg border border-line bg-paper p-4 shadow-panel">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-teal/10 text-teal">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
          <p className="text-2xl font-semibold text-ink">{value.toLocaleString()}</p>
        </div>
      </div>
    </section>
  );
}

function InfoBlock({
  compact = false,
  label,
  value
}: {
  compact?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p
        className={clsx(
          "mt-1 whitespace-pre-wrap break-words text-slate-700",
          compact ? "text-sm" : "text-sm leading-6"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function InputField({
  defaultValue,
  disabled = false,
  label,
  name,
  placeholder,
  required = false,
  type = "text"
}: {
  defaultValue?: string;
  disabled?: boolean;
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      <input
        className="h-10 w-full rounded-md border border-line bg-field px-3 text-sm text-ink outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20 disabled:cursor-not-allowed disabled:opacity-60"
        defaultValue={defaultValue}
        disabled={disabled}
        name={name}
        placeholder={placeholder}
        required={required}
        type={type}
      />
    </label>
  );
}

function TextAreaField({
  defaultValue,
  disabled = false,
  label,
  name,
  required = false,
  rows
}: {
  defaultValue?: string;
  disabled?: boolean;
  label: string;
  name: string;
  required?: boolean;
  rows: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      <textarea
        className="w-full rounded-md border border-line bg-field px-3 py-2 text-sm leading-6 text-ink outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20 disabled:cursor-not-allowed disabled:opacity-60"
        defaultValue={defaultValue}
        disabled={disabled}
        name={name}
        required={required}
        rows={rows}
      />
    </label>
  );
}

function SelectField({
  disabled = false,
  label,
  name,
  onChange,
  options,
  value
}: {
  disabled?: boolean;
  label: string;
  name?: string;
  onChange?: (value: string) => void;
  options: readonly string[];
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      <select
        className="h-10 w-full rounded-md border border-line bg-field px-3 text-sm font-semibold text-ink outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20 disabled:cursor-not-allowed disabled:opacity-60"
        defaultValue={name ? value : undefined}
        disabled={disabled}
        name={name}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        value={name ? undefined : value}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function SeverityPill({ severity }: { severity: ComplianceSeverity }) {
  return (
    <span
      className={clsx(
        "rounded-full border px-2 py-1 text-xs font-bold",
        severity === "Critical" && "border-red-300 bg-red-50 text-red-700",
        severity === "High" && "border-orange-300 bg-orange-50 text-orange-700",
        severity === "Medium" && "border-yellow-300 bg-yellow-50 text-yellow-800",
        severity === "Low" && "border-green-300 bg-green-50 text-green-700"
      )}
    >
      {severity}
    </span>
  );
}

function StatusPill({ status }: { status: ComplianceStatus }) {
  return (
    <span
      className={clsx(
        "rounded-full border px-2 py-1 text-xs font-bold",
        status === "Open" && "border-red-200 bg-red-50 text-red-700",
        status === "Monitoring" && "border-yellow-200 bg-yellow-50 text-yellow-800",
        status === "Resolved" && "border-green-200 bg-green-50 text-green-700",
        status === "Archived" && "border-slate-200 bg-slate-100 text-slate-600"
      )}
    >
      {status}
    </span>
  );
}

function HeaderLink({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
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

function StatusMessage({ message, tone }: { message: string; tone: "error" | "success" }) {
  return (
    <p
      className={clsx(
        "rounded-md border px-3 py-2 text-sm font-medium",
        tone === "error"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-green-200 bg-green-50 text-green-700"
      )}
    >
      {message}
    </p>
  );
}

function entryMatchesFilters(entry: ComplianceLogEntry, filters: ComplianceFilters) {
  const query = filters.query.trim().toLowerCase();
  const matchesQuery =
    !query ||
    [
      entry.subject,
      entry.details,
      entry.actionTaken,
      entry.followUpOwner,
      entry.centreName,
      entry.createdByName
    ]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(query));
  const matchesCategory = filters.category === "All" || entry.category === filters.category;
  const matchesSeverity = filters.severity === "All" || entry.severity === filters.severity;
  const matchesStatus = filters.status === "All" || entry.status === filters.status;

  return matchesQuery && matchesCategory && matchesSeverity && matchesStatus;
}

function getComplianceMetrics(entries: ComplianceLogEntry[]) {
  return {
    active: entries.filter((entry) => entry.status === "Open" || entry.status === "Monitoring").length,
    highPriority: entries.filter(
      (entry) => entry.severity === "High" || entry.severity === "Critical"
    ).length,
    resolved: entries.filter((entry) => entry.status === "Resolved").length
  };
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore"
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeZone: "Asia/Singapore"
  }).format(new Date(`${value}T00:00:00+08:00`));
}
