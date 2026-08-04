"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Filter,
  Inbox,
  MessageSquareText,
  RotateCcw,
  Save,
  Search,
  TicketCheck,
  UserCheck,
  type LucideIcon
} from "lucide-react";
import { updateEnquiryTicketAction } from "@/app/enquiries/actions";
import { SignOutButton } from "@/components/SignOutButton";
import type { StaffProfile } from "@/lib/staffRoles";
import type { CustomerEnquiry, EnquiryStatus, EnquiryType } from "@/types/enquiry";
import {
  enquiryStatuses,
  enquiryTypes,
  formatEnquiryStatus,
  formatEnquiryType
} from "@/types/enquiry";

type EnquiriesClientProps = {
  enquiries: CustomerEnquiry[];
  staffProfile: StaffProfile;
  savedMessage?: string;
  errorMessage?: string;
  dataError?: string;
};

type EnquiryFilterValue<TValue extends string> = "All" | TValue;
type TicketView = "open" | "closed" | "all";

const dateFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short"
});

export function EnquiriesClient({
  enquiries,
  staffProfile,
  savedMessage,
  errorMessage,
  dataError
}: EnquiriesClientProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EnquiryFilterValue<EnquiryStatus>>("All");
  const [typeFilter, setTypeFilter] = useState<EnquiryFilterValue<EnquiryType>>("All");
  const [centreFilter, setCentreFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [ticketView, setTicketView] = useState<TicketView>("open");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const centreOptions = useMemo(
    () =>
      getCentreOptions(
        enquiries,
        staffProfile.role === "lead_coach" ? staffProfile.assignedCentres : []
      ),
    [enquiries, staffProfile]
  );
  const sourceOptions = useMemo(() => getSourceOptions(enquiries), [enquiries]);
  const baseFilteredEnquiries = useMemo(
    () =>
      filterEnquiries(enquiries, {
        centre: centreFilter,
        dateFrom,
        dateTo,
        search,
        source: sourceFilter,
        status: statusFilter,
        type: typeFilter
      }),
    [centreFilter, dateFrom, dateTo, enquiries, search, sourceFilter, statusFilter, typeFilter]
  );
  const visibleEnquiries = useMemo(
    () => filterByTicketView(baseFilteredEnquiries, ticketView),
    [baseFilteredEnquiries, ticketView]
  );
  const totals = useMemo(
    () => ({
      active: baseFilteredEnquiries.filter((enquiry) => enquiry.status !== "closed").length,
      closed: baseFilteredEnquiries.filter((enquiry) => enquiry.status === "closed").length,
      signUps: baseFilteredEnquiries.filter(isSignedUp).length,
      trials: baseFilteredEnquiries.filter(hasTrialActivity).length
    }),
    [baseFilteredEnquiries]
  );

  function resetFilters() {
    setSearch("");
    setStatusFilter("All");
    setTypeFilter("All");
    setCentreFilter("All");
    setSourceFilter("All");
    setTicketView("open");
    setDateFrom("");
    setDateTo("");
  }

  return (
    <main className="mx-auto flex min-w-0 w-full max-w-[1600px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex min-w-0 flex-col gap-4 rounded-lg border border-line bg-paper p-4 shadow-panel lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase text-teal">Red Dot Penguins</p>
          <h1 className="mt-1 break-words text-2xl font-semibold text-ink sm:text-3xl">
            Enquiries and Sign Ups
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:w-auto">
          <Link
            href="/dashboard"
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal sm:flex-none"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Dashboard
          </Link>
          <SignOutButton className="flex-1 sm:flex-none" />
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <MetricCard icon={Inbox} label="Open tickets" value={totals.active} />
        <MetricCard icon={MessageSquareText} label="Trial activity" value={totals.trials} />
        <MetricCard icon={UserCheck} label="Sign ups" value={totals.signUps} />
        <MetricCard icon={CheckCircle2} label="Closed" value={totals.closed} />
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
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-8">
          <label className="relative block md:col-span-2">
            <span className="mb-1 block text-sm font-medium text-slate-600">Search enquiry</span>
            <Search aria-hidden="true" className="absolute bottom-3 left-3 size-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-10 w-full rounded-md border border-line bg-field pl-9 pr-3 text-sm outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
              placeholder="Name, phone, centre, coach, message"
            />
          </label>

          <SelectField
            label="Status"
            value={statusFilter}
            values={["All", ...enquiryStatuses]}
            labelForValue={(value) => (value === "All" ? "All statuses" : formatEnquiryStatus(value))}
            onChange={(value) => {
              setStatusFilter(value);
              if (value === "closed") {
                setTicketView("closed");
              } else if (ticketView === "closed") {
                setTicketView("open");
              }
            }}
          />

          <SelectField
            label="View"
            value={ticketView}
            values={["open", "closed", "all"]}
            labelForValue={formatTicketView}
            onChange={(value) => setTicketView(value)}
          />

          <SelectField
            label="Type"
            value={typeFilter}
            values={["All", ...enquiryTypes]}
            labelForValue={(value) => (value === "All" ? "All types" : formatEnquiryType(value))}
            onChange={(value) => setTypeFilter(value)}
          />

          <SelectField
            label="Centre"
            value={centreFilter}
            values={["All", ...centreOptions]}
            labelForValue={(value) => (value === "All" ? "All centres" : value)}
            onChange={(value) => setCentreFilter(value)}
          />

          <SelectField
            label="Source"
            value={sourceFilter}
            values={["All", ...sourceOptions]}
            labelForValue={(value) => (value === "All" ? "All sources" : value)}
            onChange={(value) => setSourceFilter(value)}
          />

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-600">From</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="h-10 w-full rounded-md border border-line bg-field px-3 text-sm outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-600">To</span>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="h-10 w-full rounded-md border border-line bg-field px-3 text-sm outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
            />
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-600">
            <Filter aria-hidden="true" className="size-4 text-teal" />
            {visibleEnquiries.length.toLocaleString()} tickets shown
          </span>
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-medium text-slate-700 transition hover:border-teal hover:text-teal"
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            Reset filters
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-paper shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Customer tickets</h2>
            <p className="text-sm text-slate-500">Enquiry, trial, and sign-up follow-ups</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-md border border-line bg-field px-3 py-2 text-sm font-semibold text-slate-700">
            <TicketCheck aria-hidden="true" className="size-4 text-teal" />
            {visibleEnquiries.length.toLocaleString()} shown
          </span>
        </div>

        <div className="max-h-[760px] overflow-y-auto">
          {visibleEnquiries.length > 0 ? (
            <div className="divide-y divide-line">
              {visibleEnquiries.map((enquiry) => (
                <EnquiryRow enquiry={enquiry} key={enquiry.id} />
              ))}
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              No tickets match these filters.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function EnquiryRow({ enquiry }: { enquiry: CustomerEnquiry }) {
  const formId = `enquiry-${enquiry.id}`;
  const centreName = getEnquiryCentre(enquiry);

  return (
    <article className="bg-paper px-4 py-4 odd:bg-paper even:bg-field/40">
      <form
        action={updateEnquiryTicketAction}
        className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.2fr)_minmax(0,1.2fr)]"
        id={formId}
      >
        <input name="enquiryId" type="hidden" value={enquiry.id} />
        <input name="centreName" type="hidden" value={enquiry.centreName ?? ""} />

        <section className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="break-words text-base font-semibold text-ink">
                {enquiry.parentName}
              </h3>
              <p className="mt-1 break-words text-xs text-slate-500">
                {enquiry.phone || enquiry.email || "-"}
              </p>
            </div>
            <StatusPill status={enquiry.status} />
          </div>

          <div className="mt-3 text-xs text-slate-500">
            {enquiry.childName || "Child not provided"}
            {enquiry.childAge ? `, ${enquiry.childAge}` : ""}
          </div>

          <div className="mt-3 space-y-1 text-xs text-slate-500">
            <ReadLine
              label="Received"
              value={formatDate(enquiry.enquiryReceivedAt ?? enquiry.createdAt)}
            />
            <ReadLine label="Source" value={enquiry.source || "respond.io"} />
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase text-slate-500">Type</span>
              <select
                className="h-9 w-full rounded-md border border-line bg-field px-2 text-sm outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
                defaultValue={enquiry.enquiryType}
                name="enquiryType"
              >
                {enquiryTypes.map((type) => (
                  <option key={type} value={type}>
                    {formatEnquiryType(type)}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase text-slate-500">Status</span>
              <select
                className="h-9 w-full rounded-md border border-line bg-field px-2 text-sm outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
                defaultValue={enquiry.status}
                name="status"
              >
                {enquiryStatuses.map((status) => (
                  <option key={status} value={status}>
                    {formatEnquiryStatus(status)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <TextField
            className="mt-2"
            defaultValue={dateInputValue(enquiry.firstTouchDate)}
            label="First touch"
            name="firstTouchDate"
            type="date"
          />

          <div className="mt-3">
            <p className="mb-1 text-xs font-medium uppercase text-slate-500">First message</p>
            <p className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-line bg-field px-3 py-2 text-sm text-slate-700">
              {enquiry.message || "-"}
            </p>
          </div>
        </section>

        <section className="min-w-0">
          <h4 className="mb-2 text-sm font-semibold text-ink">Trial</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            <TextField
              defaultValue={dateInputValue(enquiry.trialDate)}
              label="Date"
              name="trialDate"
              type="date"
            />
            <TextField
              defaultValue={enquiry.trialTime ?? ""}
              label="Time"
              name="trialTime"
              placeholder="3.45pm to 4.30pm"
            />
            <TextField
              defaultValue={enquiry.trialLocation ?? enquiry.centreName ?? ""}
              label="Location"
              name="trialLocation"
              placeholder="SJII"
            />
            <TextField
              defaultValue={enquiry.trialCoach ?? enquiry.assignedTo ?? ""}
              label="Coach"
              name="trialCoach"
              placeholder="Coach name"
            />
          </div>
          <TextareaField
            className="mt-2"
            defaultValue={enquiry.trialDetails ?? ""}
            label="Details"
            name="trialDetails"
            rows={3}
          />
        </section>

        <section className="min-w-0">
          <h4 className="mb-2 text-sm font-semibold text-ink">Sign Up</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            <TextField
              defaultValue={dateInputValue(enquiry.registrationDate)}
              label="Registration"
              name="registrationDate"
              type="date"
            />
            <TextField
              defaultValue={enquiry.signedUpLocation ?? ""}
              label="Location"
              name="signedUpLocation"
              placeholder={centreName || "Centre"}
            />
          </div>
          <TextField
            className="mt-2"
            defaultValue={enquiry.signedUpCoach ?? ""}
            label="Coach"
            name="signedUpCoach"
            placeholder="Coach name"
          />
          <TextareaField
            className="mt-2"
            defaultValue={enquiry.outcomeNotes ?? ""}
            label="Outcome details"
            name="outcomeNotes"
            rows={3}
          />
        </section>

        <section className="min-w-0 xl:col-span-2">
          <TextareaField
            defaultValue={enquiry.notes ?? ""}
            label="Internal notes"
            name="notes"
            rows={4}
          />
          {enquiry.closedAt ? (
            <div className="mt-2 text-xs text-slate-500">Closed {formatDate(enquiry.closedAt)}</div>
          ) : null}
        </section>

        <section className="flex min-w-0 flex-col justify-end gap-2 sm:flex-row xl:flex-col">
          <SubmitButton icon="save" label="Save" />
          {enquiry.status !== "closed" ? (
            <SubmitButton
              icon="close"
              label="Close ticket"
              name="statusOverride"
              value="closed"
              variant="secondary"
            />
          ) : null}
        </section>
      </form>
    </article>
  );
}

function SelectField<TValue extends string>({
  label,
  value,
  values,
  onChange,
  labelForValue = (option) => option
}: {
  label: string;
  value: TValue;
  values: TValue[];
  onChange: (value: TValue) => void;
  labelForValue?: (value: TValue) => string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as TValue)}
        className="h-10 w-full rounded-md border border-line bg-field px-3 text-sm outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
      >
        {values.map((option) => (
          <option key={`${label}-${option || "blank"}`} value={option}>
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
  form,
  label,
  name,
  placeholder,
  type = "text"
}: {
  className?: string;
  defaultValue: string;
  form?: string;
  label: string;
  name: string;
  placeholder?: string;
  type?: "date" | "text";
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium uppercase text-slate-500">{label}</span>
      <input
        className="h-9 w-full rounded-md border border-line bg-field px-2 text-sm outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
        defaultValue={defaultValue}
        form={form}
        name={name}
        placeholder={placeholder}
        type={type}
      />
    </label>
  );
}

function TextareaField({
  className = "",
  defaultValue,
  form,
  label,
  name,
  rows
}: {
  className?: string;
  defaultValue: string;
  form?: string;
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
        form={form}
        name={name}
        rows={rows}
      />
    </label>
  );
}

function ReadLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1">
      <span className="font-medium text-slate-600">{label}:</span>
      <span>{value}</span>
    </div>
  );
}

function SubmitButton({
  icon,
  label,
  name,
  variant = "primary",
  value
}: {
  icon: "save" | "close";
  label: string;
  name?: string;
  variant?: "primary" | "secondary";
  value?: string;
}) {
  const { pending } = useFormStatus();
  const Icon = icon === "save" ? Save : TicketCheck;

  return (
    <button
      type="submit"
      disabled={pending}
      name={name}
      value={value}
      className={
        variant === "primary"
          ? "inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-teal px-3 text-sm font-semibold text-white transition hover:bg-teal/90 disabled:cursor-wait disabled:opacity-70"
          : "inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal disabled:cursor-wait disabled:opacity-70"
      }
    >
      <Icon aria-hidden="true" className="size-4" />
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
        <Icon aria-hidden="true" className="size-5 text-teal" />
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

function StatusPill({ status }: { status: EnquiryStatus }) {
  const classes =
    status === "closed"
      ? "bg-slate-100 text-slate-600"
      : status === "signed_up"
        ? "bg-emerald-100 text-emerald-700"
        : status === "trial_booked"
          ? "bg-sky-100 text-sky-700"
          : status === "contacted"
            ? "bg-amber-100 text-amber-700"
            : "bg-orange-100 text-orange-700";

  return (
    <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${classes}`}>
      {formatEnquiryStatus(status)}
    </span>
  );
}

function formatTicketView(view: TicketView) {
  if (view === "open") {
    return "Open only";
  }

  if (view === "closed") {
    return "Closed only";
  }

  return "All tickets";
}

function getCentreOptions(enquiries: CustomerEnquiry[], assignedCentres: string[]) {
  const centres =
    assignedCentres.length > 0
      ? assignedCentres
      : enquiries.flatMap((enquiry) => [
          enquiry.centreName ?? "",
          enquiry.trialLocation ?? "",
          enquiry.signedUpLocation ?? ""
        ]);

  return Array.from(new Set(centres.map((centre) => centre.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

function getSourceOptions(enquiries: CustomerEnquiry[]) {
  return Array.from(
    new Set(
      enquiries
        .map((enquiry) => enquiry.source?.trim())
        .filter((source): source is string => Boolean(source))
    )
  ).sort((a, b) => a.localeCompare(b));
}

function filterByTicketView(enquiries: CustomerEnquiry[], ticketView: TicketView) {
  if (ticketView === "open") {
    return enquiries.filter((enquiry) => enquiry.status !== "closed");
  }

  if (ticketView === "closed") {
    return enquiries.filter((enquiry) => enquiry.status === "closed");
  }

  return enquiries;
}

function filterEnquiries(
  enquiries: CustomerEnquiry[],
  filters: {
    centre: string;
    dateFrom: string;
    dateTo: string;
    search: string;
    source: string;
    status: EnquiryFilterValue<EnquiryStatus>;
    type: EnquiryFilterValue<EnquiryType>;
  }
) {
  const search = filters.search.trim().toLowerCase();
  const fromTime = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00+08:00`).getTime() : null;
  const toTime = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59+08:00`).getTime() : null;

  return enquiries.filter((enquiry) => {
    const receivedTime = new Date(enquiry.enquiryReceivedAt ?? enquiry.createdAt).getTime();
    const matchesSearch =
      !search ||
      [
        enquiry.parentName,
        enquiry.phone,
        enquiry.email,
        enquiry.childName,
        enquiry.childAge,
        enquiry.centreName,
        enquiry.programme,
        enquiry.message,
        enquiry.firstTouchDate,
        enquiry.trialTime,
        enquiry.trialDetails,
        enquiry.trialDate,
        enquiry.trialLocation,
        enquiry.trialCoach,
        enquiry.registrationDate,
        enquiry.signedUpLocation,
        enquiry.signedUpCoach,
        enquiry.outcomeNotes,
        enquiry.notes,
        enquiry.source
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(search));
    const matchesStatus = filters.status === "All" || enquiry.status === filters.status;
    const matchesType = filters.type === "All" || enquiry.enquiryType === filters.type;
    const matchesCentre =
      filters.centre === "All" ||
      [
        enquiry.centreName,
        enquiry.trialLocation,
        enquiry.signedUpLocation
      ].some((centre) => centre?.trim().toLowerCase() === filters.centre.trim().toLowerCase());
    const matchesSource =
      filters.source === "All" ||
      enquiry.source?.trim().toLowerCase() === filters.source.trim().toLowerCase();
    const matchesFrom = fromTime === null || receivedTime >= fromTime;
    const matchesTo = toTime === null || receivedTime <= toTime;

    return (
      matchesSearch &&
      matchesStatus &&
      matchesType &&
      matchesCentre &&
      matchesSource &&
      matchesFrom &&
      matchesTo
    );
  });
}

function isSignedUp(enquiry: CustomerEnquiry) {
  return Boolean(
    enquiry.status === "signed_up" ||
      enquiry.enquiryType === "sign_up" ||
      enquiry.registrationDate ||
      enquiry.signedUpLocation
  );
}

function hasTrialActivity(enquiry: CustomerEnquiry) {
  return Boolean(
    enquiry.status === "trial_booked" ||
      enquiry.enquiryType === "trial" ||
      enquiry.trialDate ||
      enquiry.trialTime
  );
}

function getEnquiryCentre(enquiry: CustomerEnquiry) {
  return enquiry.trialLocation || enquiry.signedUpLocation || enquiry.centreName || "";
}

function dateInputValue(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return dateFormatter.format(new Date(value));
}
