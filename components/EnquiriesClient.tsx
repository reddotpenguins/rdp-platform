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

  const centreOptions = useMemo(
    () =>
      getCentreOptions(
        enquiries,
        staffProfile.role === "lead_coach" ? staffProfile.assignedCentres : []
      ),
    [enquiries, staffProfile]
  );
  const visibleEnquiries = useMemo(
    () =>
      filterEnquiries(enquiries, {
        centre: centreFilter,
        search,
        status: statusFilter,
        type: typeFilter
      }),
    [centreFilter, enquiries, search, statusFilter, typeFilter]
  );
  const totals = useMemo(
    () => ({
      active: enquiries.filter((enquiry) => enquiry.status !== "closed").length,
      closed: enquiries.filter((enquiry) => enquiry.status === "closed").length,
      signUps: enquiries.filter((enquiry) => enquiry.enquiryType === "sign_up").length,
      trials: enquiries.filter((enquiry) => enquiry.enquiryType === "trial").length
    }),
    [enquiries]
  );

  function resetFilters() {
    setSearch("");
    setStatusFilter("All");
    setTypeFilter("All");
    setCentreFilter("All");
  }

  return (
    <main className="mx-auto flex min-w-0 w-full max-w-[1500px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
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
        <MetricCard icon={MessageSquareText} label="Trial enquiries" value={totals.trials} />
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
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="relative block xl:col-span-2">
            <span className="mb-1 block text-sm font-medium text-slate-600">Search enquiry</span>
            <Search aria-hidden="true" className="absolute bottom-3 left-3 size-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-10 w-full rounded-md border border-line bg-field pl-9 pr-3 text-sm outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
              placeholder="Parent, child, phone, message"
            />
          </label>

          <SelectField
            label="Status"
            value={statusFilter}
            values={["All", ...enquiryStatuses]}
            labelForValue={(value) => (value === "All" ? "All statuses" : formatEnquiryStatus(value))}
            onChange={(value) => setStatusFilter(value)}
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
            {enquiries.length.toLocaleString()} total
          </span>
        </div>

        <div className="max-h-[690px] overflow-auto">
          <table className="min-w-[1320px] w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-field text-xs uppercase text-slate-500 shadow-[0_1px_0_#ffd6b3]">
              <tr>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Centre</th>
                <th className="px-4 py-3 font-semibold">Message</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Notes</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleEnquiries.length > 0 ? (
                visibleEnquiries.map((enquiry) => (
                  <EnquiryRow enquiry={enquiry} key={enquiry.id} />
                ))
              ) : (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={7}>
                    No tickets match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function EnquiryRow({ enquiry }: { enquiry: CustomerEnquiry }) {
  const formId = `enquiry-${enquiry.id}`;

  return (
    <tr className="align-top odd:bg-paper even:bg-field/50">
      <td className="border-b border-line px-4 py-3">
        <div className="font-semibold text-ink">{enquiry.parentName}</div>
        <div className="mt-1 text-xs text-slate-500">{enquiry.phone || enquiry.email || "-"}</div>
        <div className="mt-2 text-xs text-slate-500">
          {enquiry.childName || "Child not provided"}
          {enquiry.childAge ? `, ${enquiry.childAge}` : ""}
        </div>
        <div className="mt-2 text-xs text-slate-400">{formatDate(enquiry.createdAt)}</div>
      </td>
      <td className="border-b border-line px-4 py-3">
        <span className="inline-flex rounded-md bg-teal/10 px-2 py-1 text-xs font-semibold text-teal">
          {formatEnquiryType(enquiry.enquiryType)}
        </span>
        <div className="mt-2 text-xs text-slate-500">{enquiry.source || "respond.io"}</div>
      </td>
      <td className="border-b border-line px-4 py-3">
        <div className="font-medium text-slate-700">{enquiry.centreName || "-"}</div>
        <div className="mt-1 text-xs text-slate-500">{enquiry.programme || "-"}</div>
      </td>
      <td className="border-b border-line px-4 py-3">
        <p className="max-w-md whitespace-pre-wrap text-slate-700">
          {enquiry.message || "-"}
        </p>
      </td>
      <td className="border-b border-line px-4 py-3">
        <StatusPill status={enquiry.status} />
        {enquiry.closedAt ? (
          <div className="mt-2 text-xs text-slate-500">Closed {formatDate(enquiry.closedAt)}</div>
        ) : null}
      </td>
      <td className="border-b border-line px-4 py-3">
        <textarea
          className="min-h-20 w-72 rounded-md border border-line bg-field px-3 py-2 text-sm outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
          defaultValue={enquiry.notes ?? ""}
          form={formId}
          name="notes"
          rows={3}
        />
      </td>
      <td className="border-b border-line px-4 py-3">
        <div className="flex w-48 flex-col gap-2">
          <select
            className="h-10 w-full rounded-md border border-line bg-field px-3 text-sm outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
            defaultValue={enquiry.status}
            form={formId}
            name="status"
          >
            {enquiryStatuses.map((status) => (
              <option key={status} value={status}>
                {formatEnquiryStatus(status)}
              </option>
            ))}
          </select>

          <form action={updateEnquiryTicketAction} className="flex flex-col gap-2" id={formId}>
            <input name="enquiryId" type="hidden" value={enquiry.id} />
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
          </form>
        </div>
      </td>
    </tr>
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

function getCentreOptions(enquiries: CustomerEnquiry[], assignedCentres: string[]) {
  const centres = assignedCentres.length > 0
    ? assignedCentres
    : enquiries.map((enquiry) => enquiry.centreName ?? "");

  return Array.from(
    new Set(centres.map((centre) => centre.trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
}

function filterEnquiries(
  enquiries: CustomerEnquiry[],
  filters: {
    centre: string;
    search: string;
    status: EnquiryFilterValue<EnquiryStatus>;
    type: EnquiryFilterValue<EnquiryType>;
  }
) {
  const search = filters.search.trim().toLowerCase();

  return enquiries.filter((enquiry) => {
    const matchesSearch =
      !search ||
      [
        enquiry.parentName,
        enquiry.phone,
        enquiry.email,
        enquiry.childName,
        enquiry.centreName,
        enquiry.programme,
        enquiry.message,
        enquiry.notes
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(search));
    const matchesStatus = filters.status === "All" || enquiry.status === filters.status;
    const matchesType = filters.type === "All" || enquiry.enquiryType === filters.type;
    const matchesCentre =
      filters.centre === "All" ||
      enquiry.centreName?.trim().toLowerCase() === filters.centre.trim().toLowerCase();

    return matchesSearch && matchesStatus && matchesType && matchesCentre;
  });
}

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}
