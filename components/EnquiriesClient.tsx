"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Filter,
  Inbox,
  MapPin,
  MessageSquareText,
  Phone,
  RotateCcw,
  Save,
  Search,
  TicketCheck,
  UserCheck,
  type LucideIcon
} from "lucide-react";
import { updateEnquiryTicketAction } from "@/app/enquiries/actions";
import { SignOutButton } from "@/components/SignOutButton";
import { getCentreFilterAccess, type StaffProfile } from "@/lib/staffRoles";
import type { CustomerEnquiry, EnquiryStatus, EnquiryType } from "@/types/enquiry";
import {
  enquiryStatuses,
  enquiryTypes,
  formatEnquiryStatus,
  formatEnquiryType
} from "@/types/enquiry";
import { formatProgrammeOption, getProgrammeSelectOptions } from "@/types/programme";

type EnquiriesClientProps = {
  enquiries: CustomerEnquiry[];
  staffProfile: StaffProfile;
  initialFilters?: InitialEnquiryFilters;
  savedMessage?: string;
  errorMessage?: string;
  dataError?: string;
};

type EnquiryFilterValue<TValue extends string> = "All" | TValue;
type TicketTab = "open" | "new" | "contacted" | "trial_booked" | "signed_up" | "closed" | "all";
type SortOrder = "latest" | "oldest";
type SourceCategory = "respond.io" | "website contact form";
type InitialEnquiryFilters = {
  centre?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  sort?: string;
  source?: string;
  tab?: string;
  type?: string;
};

type EnquiryFiltersState = {
  centreFilter: string;
  dateFrom: string;
  dateTo: string;
  search: string;
  sortOrder: SortOrder;
  sourceFilter: EnquiryFilterValue<SourceCategory>;
  ticketTab: TicketTab;
  typeFilter: EnquiryFilterValue<EnquiryType>;
};

const sourceCategories: SourceCategory[] = ["respond.io", "website contact form"];
const ticketTabs: TicketTab[] = [
  "open",
  "new",
  "contacted",
  "trial_booked",
  "signed_up",
  "closed",
  "all"
];

const dateFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short"
});

const defaultEnquiryFilters: EnquiryFiltersState = {
  centreFilter: "All",
  dateFrom: "",
  dateTo: "",
  search: "",
  sortOrder: "latest",
  sourceFilter: "All",
  ticketTab: "open",
  typeFilter: "All"
};

export function EnquiriesClient({
  enquiries,
  staffProfile,
  initialFilters,
  savedMessage,
  errorMessage,
  dataError
}: EnquiriesClientProps) {
  const initialFilterValues = normalizeInitialFilters(initialFilters);
  const [records, setRecords] = useState(enquiries);
  const [toastMessage, setToastMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [pageMessage, setPageMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(() =>
    savedMessage
      ? { text: savedMessage, tone: "success" }
      : errorMessage
        ? { text: errorMessage, tone: "error" }
        : null
  );
  const [search, setSearch] = useState(initialFilterValues.search);
  const [typeFilter, setTypeFilter] = useState<EnquiryFilterValue<EnquiryType>>(
    initialFilterValues.typeFilter
  );
  const [centreFilter, setCentreFilter] = useState(initialFilterValues.centreFilter);
  const [sourceFilter, setSourceFilter] = useState<EnquiryFilterValue<SourceCategory>>(
    initialFilterValues.sourceFilter
  );
  const [ticketTab, setTicketTab] = useState<TicketTab>(initialFilterValues.ticketTab);
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialFilterValues.sortOrder);
  const [dateFrom, setDateFrom] = useState(initialFilterValues.dateFrom);
  const [dateTo, setDateTo] = useState(initialFilterValues.dateTo);
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);

  useEffect(() => {
    setRecords(enquiries);
  }, [enquiries]);

  const centreOptions = useMemo(
    () => {
      const centreAccess = getCentreFilterAccess(staffProfile);

      return getCentreOptions(records, centreAccess.centres);
    },
    [records, staffProfile]
  );
  const baseFilteredEnquiries = useMemo(
    () =>
      filterEnquiries(records, {
        centre: centreFilter,
        dateFrom,
        dateTo,
        search,
        source: sourceFilter,
        type: typeFilter
      }),
    [centreFilter, dateFrom, dateTo, records, search, sourceFilter, typeFilter]
  );
  const visibleEnquiries = useMemo(
    () => sortEnquiries(filterByTicketTab(baseFilteredEnquiries, ticketTab), sortOrder),
    [baseFilteredEnquiries, sortOrder, ticketTab]
  );
  const tabCounts = useMemo(() => getTicketTabCounts(baseFilteredEnquiries), [baseFilteredEnquiries]);
  const totals = useMemo(
    () => ({
      active: baseFilteredEnquiries.filter((enquiry) => enquiry.status !== "closed").length,
      closed: baseFilteredEnquiries.filter((enquiry) => enquiry.status === "closed").length,
      signUps: baseFilteredEnquiries.filter(isSignedUp).length,
      trials: baseFilteredEnquiries.filter(hasTrialActivity).length
    }),
    [baseFilteredEnquiries]
  );
  const returnQuery = useMemo(
    () =>
      buildFilterReturnQuery({
        centreFilter,
        dateFrom,
        dateTo,
        search,
        sortOrder,
        sourceFilter,
        ticketTab,
        typeFilter
      }),
    [centreFilter, dateFrom, dateTo, search, sortOrder, sourceFilter, ticketTab, typeFilter]
  );

  function resetFilters() {
    setSearch(defaultEnquiryFilters.search);
    setTypeFilter(defaultEnquiryFilters.typeFilter);
    setCentreFilter(defaultEnquiryFilters.centreFilter);
    setSourceFilter(defaultEnquiryFilters.sourceFilter);
    setTicketTab(defaultEnquiryFilters.ticketTab);
    setSortOrder(defaultEnquiryFilters.sortOrder);
    setDateFrom(defaultEnquiryFilters.dateFrom);
    setDateTo(defaultEnquiryFilters.dateTo);
    setExpandedTicketId(null);
  }

  function updateTicket(updatedEnquiry: CustomerEnquiry, message: string) {
    setRecords((currentRecords) =>
      currentRecords.map((enquiry) =>
        enquiry.id === updatedEnquiry.id ? updatedEnquiry : enquiry
      )
    );
    setPageMessage(null);
    setToastMessage({ text: message, tone: "success" });
  }

  function showTicketError(message: string) {
    setPageMessage(null);
    setToastMessage({ text: message, tone: "error" });
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
            href="/admin"
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal sm:flex-none"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Admin home
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

      {pageMessage ? (
        <StatusMessage tone={pageMessage.tone} message={pageMessage.text} />
      ) : dataError ? (
        <StatusMessage
          tone="error"
          message={`${dataError}. Run the latest Supabase SQL setup before using this page.`}
        />
      ) : null}

      <section className="rounded-lg border border-line bg-paper p-4 shadow-panel">
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
            <label className="relative block">
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
              label="Sort"
              value={sortOrder}
              values={["latest", "oldest"]}
              labelForValue={formatSortOrder}
              onChange={(value) => setSortOrder(value)}
            />
          </div>

          <TicketTabs activeTab={ticketTab} counts={tabCounts} onChange={setTicketTab} />

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
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
              values={["All", ...sourceCategories]}
              labelForValue={(value) =>
                value === "All" ? "All sources" : formatSourceCategory(value)
              }
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
            <p className="text-sm text-slate-500">Compact ticket inbox with full details on open</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-md border border-line bg-field px-3 py-2 text-sm font-semibold text-slate-700">
            <TicketCheck aria-hidden="true" className="size-4 text-teal" />
            {visibleEnquiries.length.toLocaleString()} shown
          </span>
        </div>

        <div className="max-h-[760px] overflow-y-auto bg-field p-3">
          {visibleEnquiries.length > 0 ? (
            <div className="space-y-3">
              {visibleEnquiries.map((enquiry, index) => (
                <EnquiryRow
                  enquiry={enquiry}
                  isAlternate={index % 2 === 1}
                  isExpanded={expandedTicketId === enquiry.id}
                  key={enquiry.id}
                  onToggle={() =>
                    setExpandedTicketId(expandedTicketId === enquiry.id ? null : enquiry.id)
                  }
                  returnQuery={returnQuery}
                  onTicketError={showTicketError}
                  onTicketUpdated={updateTicket}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-line bg-paper px-4 py-8 text-center text-sm text-slate-500">
              No tickets match these filters.
            </div>
          )}
        </div>
      </section>
      {toastMessage ? (
        <div
          className={`fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border px-4 py-3 text-sm font-semibold shadow-panel ${
            toastMessage.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
          role="status"
        >
          {toastMessage.text}
        </div>
      ) : null}
    </main>
  );
}

function TicketTabs({
  activeTab,
  counts,
  onChange
}: {
  activeTab: TicketTab;
  counts: Record<TicketTab, number>;
  onChange: (tab: TicketTab) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {ticketTabs.map((tab) => {
        const isActive = activeTab === tab;

        return (
          <button
            key={tab}
            type="button"
            onClick={() => onChange(tab)}
            className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition ${
              isActive
                ? "border-teal bg-teal text-white shadow-sm"
                : "border-line bg-paper text-slate-700 hover:border-teal hover:text-teal"
            }`}
          >
            {formatTicketTab(tab)}
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                isActive ? "bg-white/20 text-white" : "bg-field text-slate-500"
              }`}
            >
              {counts[tab].toLocaleString()}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function EnquiryRow({
  enquiry,
  isAlternate,
  isExpanded,
  onTicketError,
  onTicketUpdated,
  onToggle,
  returnQuery
}: {
  enquiry: CustomerEnquiry;
  isAlternate: boolean;
  isExpanded: boolean;
  onTicketError: (message: string) => void;
  onTicketUpdated: (enquiry: CustomerEnquiry, message: string) => void;
  onToggle: () => void;
  returnQuery: string;
}) {
  const [pending, setPending] = useState(false);
  const centreName = getEnquiryCentre(enquiry);
  const contact = enquiry.phone || enquiry.email || "-";
  const formId = `enquiry-${enquiry.id}`;
  const trialSummary = getTrialSummary(enquiry);
  const messagePreview = getMessagePreview(enquiry.message);
  const cardSurfaceClass = isAlternate ? "bg-slate-100" : "bg-paper";
  const expandedSurfaceClass = isAlternate ? "bg-slate-50" : "bg-white";

  async function updateTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter;

    if (submitter instanceof HTMLButtonElement && submitter.name) {
      formData.set(submitter.name, submitter.value);
    }

    setPending(true);

    try {
      const result = await updateEnquiryTicketAction(formData);

      if (result.ok) {
        onTicketUpdated(result.enquiry, result.message);
      } else {
        onTicketError(result.error);
      }
    } catch (error) {
      onTicketError(getActionErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <article
      className={`overflow-hidden rounded-lg border ${cardSurfaceClass} shadow-sm transition ${
        isExpanded ? "border-teal ring-2 ring-teal/10" : "border-line hover:border-slate-300"
      }`}
    >
      <div className={`border-l-4 ${getTicketAccentClass(enquiry.status)}`}>
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.35fr)_auto] lg:items-start">
          <section className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-start gap-2">
              <h3 className="min-w-0 flex-1 break-words text-base font-semibold text-ink">
                {enquiry.parentName}
              </h3>
              <StatusPill status={enquiry.status} />
            </div>
            <p className="mt-2 flex items-center gap-2 break-words text-sm text-slate-600">
              <Phone aria-hidden="true" className="size-4 shrink-0 text-slate-400" />
              {contact}
            </p>
            <p className="mt-2 break-words text-sm text-slate-500">
              {enquiry.childName || "Child not provided"}
              {enquiry.childAge ? `, ${enquiry.childAge}` : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <TicketTag>{formatSourceCategory(getEnquirySourceCategory(enquiry))}</TicketTag>
              <TicketTag>{formatEnquiryType(enquiry.enquiryType)}</TicketTag>
            </div>
          </section>

          <section className="grid min-w-0 gap-3 sm:grid-cols-2">
            <TicketMeta
              icon={CalendarDays}
              label="Received"
              value={formatDate(enquiry.enquiryReceivedAt ?? enquiry.createdAt)}
            />
            <TicketMeta icon={MapPin} label="Centre" value={centreName || "-"} />
            <TicketMeta icon={Clock3} label="Trial" value={trialSummary} />
            <div className="min-w-0 sm:col-span-2">
              <p className="text-xs font-semibold uppercase text-slate-500">Message</p>
              <p className="mt-1 line-clamp-2 break-words text-sm text-slate-700">
                {messagePreview}
              </p>
            </div>
          </section>

          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isExpanded}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal lg:w-32"
          >
            {isExpanded ? (
              <ChevronUp aria-hidden="true" className="size-4" />
            ) : (
              <ChevronDown aria-hidden="true" className="size-4" />
            )}
            {isExpanded ? "Hide" : "Open"}
          </button>
        </div>
      </div>

      {isExpanded ? (
        <form
          className={`grid min-w-0 gap-5 border-t border-line ${expandedSurfaceClass} p-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]`}
          id={formId}
          key={enquiry.updatedAt}
          onSubmit={updateTicket}
        >
          <input name="enquiryId" type="hidden" value={enquiry.id} />
          <input name="centreName" type="hidden" value={enquiry.centreName ?? ""} />
          <input name="returnQuery" type="hidden" value={returnQuery} />

          <section className="min-w-0">
            <h4 className="mb-2 text-sm font-semibold text-ink">Contact</h4>
            <div className="grid gap-2 sm:grid-cols-2">
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
            <ProgrammeField
              className="mt-2"
              defaultValue={enquiry.programme ?? ""}
              name="programme"
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
            <SubmitButton icon="save" label="Save" pending={pending} />
            {enquiry.status !== "signed_up" ? (
              <SubmitButton
                icon="signup"
                label="Mark signed up"
                name="statusOverride"
                pending={pending}
                value="signed_up"
                variant="secondary"
              />
            ) : null}
            {enquiry.status !== "closed" ? (
              <SubmitButton
                icon="close"
                label="Close ticket"
                name="statusOverride"
                pending={pending}
                value="closed"
                variant="secondary"
              />
            ) : null}
          </section>
        </form>
      ) : null}
    </article>
  );
}

function TicketTag({ children }: { children: string }) {
  return (
    <span className="inline-flex rounded-md bg-field px-2 py-1 text-xs font-semibold text-slate-600">
      {children}
    </span>
  );
}

function TicketMeta({
  icon: Icon,
  label,
  value
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-500">
        <Icon aria-hidden="true" className="size-3.5 shrink-0 text-slate-400" />
        {label}
      </p>
      <p className="mt-1 break-words text-sm text-slate-700">{value}</p>
    </div>
  );
}

function ProgrammeField({
  className = "",
  defaultValue,
  name
}: {
  className?: string;
  defaultValue: string;
  name: string;
}) {
  const programmeValue = defaultValue.trim();
  const values = getProgrammeSelectOptions(programmeValue);

  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium uppercase text-slate-500">Programme</span>
      <select
        className="h-9 w-full rounded-md border border-line bg-field px-2 text-sm outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
        defaultValue={programmeValue}
        name={name}
      >
        {values.map((option) => (
          <option key={`programme-${option || "blank"}`} value={option}>
            {formatProgrammeOption(option)}
          </option>
        ))}
      </select>
    </label>
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

function SubmitButton({
  icon,
  label,
  name,
  pending,
  variant = "primary",
  value
}: {
  icon: "save" | "close" | "signup";
  label: string;
  name?: string;
  pending: boolean;
  variant?: "primary" | "secondary";
  value?: string;
}) {
  const Icon = icon === "save" ? Save : icon === "signup" ? UserCheck : TicketCheck;

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
          ? "bg-cyan-100 text-cyan-700"
          : status === "contacted"
            ? "bg-amber-100 text-amber-700"
            : "bg-sky-100 text-sky-700";

  return (
    <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${classes}`}>
      {formatEnquiryStatus(status)}
    </span>
  );
}

function formatTicketTab(tab: TicketTab) {
  if (tab === "open") {
    return "Open";
  }

  if (tab === "all") {
    return "All";
  }

  return formatEnquiryStatus(tab);
}

function formatSortOrder(sortOrder: SortOrder) {
  return sortOrder === "latest" ? "Latest first" : "Oldest first";
}

function getTicketAccentClass(status: EnquiryStatus) {
  if (status === "closed") {
    return "border-l-slate-400";
  }

  if (status === "signed_up") {
    return "border-l-emerald-500";
  }

  if (status === "trial_booked") {
    return "border-l-cyan-500";
  }

  if (status === "contacted") {
    return "border-l-amber-500";
  }

  return "border-l-sky-500";
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

function normalizeInitialFilters(initialFilters?: InitialEnquiryFilters): EnquiryFiltersState {
  const initialType = initialFilters?.type ?? defaultEnquiryFilters.typeFilter;
  const initialSource = initialFilters?.source ?? defaultEnquiryFilters.sourceFilter;
  const initialTab = initialFilters?.tab ?? defaultEnquiryFilters.ticketTab;
  const initialSort = initialFilters?.sort ?? defaultEnquiryFilters.sortOrder;

  return {
    centreFilter: initialFilters?.centre?.trim() || defaultEnquiryFilters.centreFilter,
    dateFrom: normalizeDateFilter(initialFilters?.dateFrom),
    dateTo: normalizeDateFilter(initialFilters?.dateTo),
    search: initialFilters?.search ?? defaultEnquiryFilters.search,
    sortOrder: isSortOrder(initialSort) ? initialSort : defaultEnquiryFilters.sortOrder,
    sourceFilter: isSourceFilter(initialSource)
      ? initialSource
      : defaultEnquiryFilters.sourceFilter,
    ticketTab: isTicketTab(initialTab) ? initialTab : defaultEnquiryFilters.ticketTab,
    typeFilter: isTypeFilter(initialType) ? initialType : defaultEnquiryFilters.typeFilter
  };
}

function buildFilterReturnQuery(filters: EnquiryFiltersState) {
  const params = new URLSearchParams();
  const search = filters.search.trim();

  if (search) params.set("search", search);
  if (filters.typeFilter !== defaultEnquiryFilters.typeFilter) params.set("type", filters.typeFilter);
  if (filters.centreFilter !== defaultEnquiryFilters.centreFilter) params.set("centre", filters.centreFilter);
  if (filters.sourceFilter !== defaultEnquiryFilters.sourceFilter) params.set("source", filters.sourceFilter);
  if (filters.ticketTab !== defaultEnquiryFilters.ticketTab) params.set("tab", filters.ticketTab);
  if (filters.sortOrder !== defaultEnquiryFilters.sortOrder) params.set("sort", filters.sortOrder);
  if (filters.dateFrom) params.set("from", filters.dateFrom);
  if (filters.dateTo) params.set("to", filters.dateTo);

  return params.toString();
}

function normalizeDateFilter(value: string | undefined) {
  const trimmedValue = value?.trim() ?? "";

  return /^\d{4}-\d{2}-\d{2}$/.test(trimmedValue) ? trimmedValue : "";
}

function isTypeFilter(value: string): value is EnquiryFilterValue<EnquiryType> {
  return value === "All" || enquiryTypes.includes(value as EnquiryType);
}

function isSourceFilter(value: string): value is EnquiryFilterValue<SourceCategory> {
  return value === "All" || sourceCategories.includes(value as SourceCategory);
}

function isTicketTab(value: string): value is TicketTab {
  return ticketTabs.includes(value as TicketTab);
}

function isSortOrder(value: string): value is SortOrder {
  return value === "latest" || value === "oldest";
}

function getTicketTabCounts(enquiries: CustomerEnquiry[]): Record<TicketTab, number> {
  const counts: Record<TicketTab, number> = {
    open: 0,
    new: 0,
    contacted: 0,
    trial_booked: 0,
    signed_up: 0,
    closed: 0,
    all: enquiries.length
  };

  enquiries.forEach((enquiry) => {
    if (enquiry.status !== "closed") {
      counts.open += 1;
    }

    counts[enquiry.status] += 1;

    if (enquiry.status !== "signed_up" && isSignedUp(enquiry)) {
      counts.signed_up += 1;
    }
  });

  return counts;
}

function filterByTicketTab(enquiries: CustomerEnquiry[], ticketTab: TicketTab) {
  if (ticketTab === "open") {
    return enquiries.filter((enquiry) => enquiry.status !== "closed");
  }

  if (ticketTab === "all") {
    return enquiries;
  }

  if (ticketTab === "signed_up") {
    return enquiries.filter(isSignedUp);
  }

  return enquiries.filter((enquiry) => enquiry.status === ticketTab);
}

function sortEnquiries(enquiries: CustomerEnquiry[], sortOrder: SortOrder) {
  return [...enquiries].sort((first, second) => {
    const firstTime = getEnquiryReceivedTime(first);
    const secondTime = getEnquiryReceivedTime(second);

    return sortOrder === "latest" ? secondTime - firstTime : firstTime - secondTime;
  });
}

function filterEnquiries(
  enquiries: CustomerEnquiry[],
  filters: {
    centre: string;
    dateFrom: string;
    dateTo: string;
    search: string;
    source: EnquiryFilterValue<SourceCategory>;
    type: EnquiryFilterValue<EnquiryType>;
  }
) {
  const search = filters.search.trim().toLowerCase();
  const fromTime = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00+08:00`).getTime() : null;
  const toTime = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59+08:00`).getTime() : null;

  return enquiries.filter((enquiry) => {
    const receivedTime = getEnquiryReceivedTime(enquiry);
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
        formatEnquiryStatus(enquiry.status),
        formatSourceCategory(getEnquirySourceCategory(enquiry))
      ]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(search));
    const matchesType = filters.type === "All" || enquiry.enquiryType === filters.type;
    const matchesCentre =
      filters.centre === "All" ||
      [
        enquiry.centreName,
        enquiry.trialLocation,
        enquiry.signedUpLocation
      ].some((centre) => centre?.trim().toLowerCase() === filters.centre.trim().toLowerCase());
    const matchesSource =
      filters.source === "All" || getEnquirySourceCategory(enquiry) === filters.source;
    const matchesFrom = fromTime === null || receivedTime >= fromTime;
    const matchesTo = toTime === null || receivedTime <= toTime;

    return (
      matchesSearch &&
      matchesType &&
      matchesCentre &&
      matchesSource &&
      matchesFrom &&
      matchesTo
    );
  });
}

function getTrialSummary(enquiry: CustomerEnquiry) {
  const details = [dateInputValue(enquiry.trialDate), enquiry.trialTime, enquiry.trialLocation]
    .map((value) => value?.trim())
    .filter(Boolean);

  return details.length > 0 ? details.join(" | ") : "-";
}

function getMessagePreview(message: string | null) {
  const preview = message?.replace(/\s+/g, " ").trim();

  if (!preview) {
    return "-";
  }

  return preview.length > 140 ? `${preview.slice(0, 137)}...` : preview;
}

function getEnquiryReceivedTime(enquiry: CustomerEnquiry) {
  return new Date(enquiry.enquiryReceivedAt ?? enquiry.createdAt).getTime();
}

function getActionErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Ticket could not be updated.";
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

function getEnquirySourceCategory(enquiry: CustomerEnquiry): SourceCategory {
  const source = enquiry.source?.trim().toLowerCase() ?? "";

  if (
    source.includes("website") ||
    source.includes("wordpress") ||
    source.includes("contact form") ||
    source.includes("email dashboard") ||
    source === "email" ||
    source === "website-email" ||
    source === "website_email"
  ) {
    return "website contact form";
  }

  return "respond.io";
}

function formatSourceCategory(source: SourceCategory) {
  return source === "website contact form" ? "Website form" : "respond.io";
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
