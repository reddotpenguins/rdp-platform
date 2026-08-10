"use client";

import Link from "next/link";
import { useMemo, useState, useTransition, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Clock3,
  Copy,
  FileText,
  Filter,
  GripVertical,
  MapPin,
  Minus,
  Plus,
  Save,
  Send,
  Trash2,
  Users,
  type LucideIcon
} from "lucide-react";
import {
  applyTemplateAction,
  cancelShiftAction,
  copyDayAction,
  copyWeekToNextWeekAction,
  duplicateShiftAction,
  moveShiftAction,
  publishScheduleWeekAction,
  resizeShiftAction,
  saveShiftAction,
  saveWeekAsTemplateAction,
  updateWorkLocationAction
} from "@/app/schedule/actions";
import { SignOutButton } from "@/components/SignOutButton";
import {
  addDaysToIsoDate,
  buildWeekDays,
  getRosterShiftHours,
  getScheduleWeekLabel,
  getShiftSingaporeDate,
  getShiftSingaporeTime,
  getShiftTimeRangeLabel,
  type RosterShift,
  type ScheduleConflictWarning,
  type ScheduleResourceOption,
  type ScheduleStaffOption,
  type ScheduleWorkLocation
} from "@/lib/scheduling";
import type { StaffProfile, StaffRole } from "@/lib/staffRoles";
import type { SchedulingDashboardData } from "@/lib/supabase/scheduling";

type SchedulingClientProps = {
  data: SchedulingDashboardData;
  flash: {
    text: string;
    tone: "error" | "success";
  } | null;
  staffProfile: StaffProfile;
};

type Filters = {
  departmentId: string;
  employeeId: string;
  locationId: string;
  programmeId: string;
  role: string;
};

type ViewMode = "week" | "day" | "staff";

const colourOptions = ["#f26a2e", "#14b8a6", "#2563eb", "#7c3aed", "#f59e0b", "#dc2626"];

export function SchedulingClient({ data, flash, staffProfile }: SchedulingClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState(flash);
  const [filters, setFilters] = useState<Filters>({
    departmentId: "",
    employeeId: "",
    locationId: "",
    programmeId: "",
    role: ""
  });
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [selectedDay, setSelectedDay] = useState(data.week.weekStartDate);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [draggingShiftId, setDraggingShiftId] = useState<string | null>(null);
  const weekDays = useMemo(() => buildWeekDays(data.week.weekStartDate), [data.week.weekStartDate]);
  const editingShift = useMemo(
    () => (editingShiftId ? data.shifts.find((shift) => shift.id === editingShiftId) ?? null : null),
    [data.shifts, editingShiftId]
  );
  const activeStaff = useMemo(
    () => data.staff.filter((staff) => staff.active).sort((first, second) => getStaffName(first).localeCompare(getStaffName(second))),
    [data.staff]
  );
  const filteredShifts = useMemo(
    () => data.shifts.filter((shift) => shiftMatchesFilters(shift, filters)),
    [data.shifts, filters]
  );
  const visibleStaff = useMemo(
    () =>
      activeStaff.filter((staff) => {
        if (filters.employeeId && staff.id !== filters.employeeId) {
          return false;
        }

        if (filters.role && staff.role !== filters.role) {
          return false;
        }

        return true;
      }),
    [activeStaff, filters.employeeId, filters.role]
  );
  const activeShifts = filteredShifts.filter((shift) => shift.status !== "cancelled");
  const unassignedShifts = activeShifts.filter((shift) => shift.assignments.length === 0);
  const publishedCount = data.shifts.filter((shift) => shift.status === "published").length;
  const scheduledHours = activeShifts.reduce((sum, shift) => sum + getRosterShiftHours(shift) * Math.max(shift.assignments.length, shift.requiredManpower), 0);
  const assignedStaffCount = new Set(activeShifts.flatMap((shift) => shift.assignments.map((assignment) => assignment.staffProfileId))).size;
  const nextWeekStartDate = addDaysToIsoDate(data.week.weekStartDate, 7);
  const previousWeekStartDate = addDaysToIsoDate(data.week.weekStartDate, -7);

  function runMoveShift(shiftId: string, targetDate: string, targetStaffProfileId: string) {
    startTransition(async () => {
      const result = await moveShiftAction({
        shiftId,
        targetDate,
        targetStaffProfileId,
        weekStartDate: data.week.weekStartDate
      });

      setMessage(result.ok ? { text: result.message, tone: "success" } : { text: result.error, tone: "error" });

      if (result.ok) {
        router.refresh();
      }
    });
  }

  function runResizeShift(shiftId: string, minutes: number) {
    startTransition(async () => {
      const result = await resizeShiftAction({
        minutes,
        shiftId,
        weekStartDate: data.week.weekStartDate
      });

      setMessage(result.ok ? { text: result.message, tone: "success" } : { text: result.error, tone: "error" });

      if (result.ok) {
        router.refresh();
      }
    });
  }

  return (
    <main className="mx-auto flex min-w-0 w-full max-w-[1680px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex min-w-0 flex-col gap-4 rounded-lg border border-line bg-paper p-4 shadow-panel xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase text-teal">Red Dot Penguins</p>
          <h1 className="mt-1 break-words text-2xl font-semibold text-ink sm:text-3xl">Staff Scheduling</h1>
          <p className="mt-2 text-sm text-slate-500">
            {getScheduleWeekLabel(data.week.weekStartDate)} · {formatScheduleStatus(data.week.status)} · {staffProfile.fullName}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <HeaderLink href="/admin" icon={ArrowLeft} label="Admin home" />
          <HeaderLink href={`/schedule?week=${previousWeekStartDate}`} icon={ChevronLeft} label="Previous" />
          <HeaderLink href={`/schedule?week=${nextWeekStartDate}`} icon={ChevronRight} label="Next" />
          <SignOutButton className="flex-1 sm:flex-none" />
        </div>
      </header>

      {data.error ? <StatusMessage message={data.error} tone="error" /> : null}
      {message ? <StatusMessage message={message.text} tone={message.tone} /> : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={CalendarDays} label="Shifts" value={activeShifts.length} />
        <MetricCard icon={Users} label="Staff assigned" value={assignedStaffCount} />
        <MetricCard icon={Clock3} label="Planned hours" value={scheduledHours.toFixed(2)} />
        <MetricCard icon={Send} label="Published shifts" value={publishedCount} />
      </section>

      <section className="flex min-w-0 flex-col gap-5">
        <ScheduleToolbar
          filters={filters}
          onFilterChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
          onViewModeChange={setViewMode}
          resources={{
            departments: data.departments,
            locations: data.locations,
            programmes: data.programmes,
            staff: activeStaff
          }}
          selectedDay={selectedDay}
          setSelectedDay={setSelectedDay}
          viewMode={viewMode}
          weekDays={weekDays}
        />

        <ScheduleActionsPanel
          templates={data.templates}
          weekDays={weekDays}
          weekStartDate={data.week.weekStartDate}
        />

        {viewMode === "week" ? (
          <WeekRosterGrid
            isPending={isPending}
            isDragging={Boolean(draggingShiftId)}
            onDragState={setDraggingShiftId}
            onEdit={(shift) => setEditingShiftId(shift.id)}
            onMove={runMoveShift}
            onResize={runResizeShift}
            shifts={activeShifts}
            staff={visibleStaff}
            weekDays={weekDays}
            weekStartDate={data.week.weekStartDate}
          />
        ) : viewMode === "day" ? (
          <DayRosterView
            date={selectedDay}
            isPending={isPending}
            isDragging={Boolean(draggingShiftId)}
            onDragState={setDraggingShiftId}
            onEdit={(shift) => setEditingShiftId(shift.id)}
            onMove={runMoveShift}
            onResize={runResizeShift}
            shifts={activeShifts}
            staff={visibleStaff}
            weekStartDate={data.week.weekStartDate}
          />
        ) : (
          <StaffRosterView
            isPending={isPending}
            isDragging={Boolean(draggingShiftId)}
            onDragState={setDraggingShiftId}
            onEdit={(shift) => setEditingShiftId(shift.id)}
            onMove={runMoveShift}
            onResize={runResizeShift}
            shifts={activeShifts}
            staff={visibleStaff}
            weekDays={weekDays}
            weekStartDate={data.week.weekStartDate}
          />
        )}

        <section className="grid gap-5 xl:grid-cols-[minmax(360px,1fr)_minmax(320px,0.8fr)] 2xl:grid-cols-[minmax(420px,1fr)_minmax(320px,0.85fr)_minmax(320px,0.85fr)]">
          <ShiftFormPanel
            departments={data.departments}
            editingShift={editingShift}
            locations={data.locations}
            onClear={() => setEditingShiftId(null)}
            programmes={data.programmes}
            qualifications={data.qualifications}
            staff={activeStaff}
            weekStartDate={data.week.weekStartDate}
          />
          <OpenShiftsPanel
            isPending={isPending}
            onDragState={setDraggingShiftId}
            onEdit={(shift) => setEditingShiftId(shift.id)}
            onResize={runResizeShift}
            shifts={unassignedShifts}
            weekStartDate={data.week.weekStartDate}
          />
          <ConflictPanel conflicts={data.conflicts.filter((conflict) => conflictMatchesFilters(conflict, activeShifts))} />
          <div className="xl:col-span-2 2xl:col-span-3">
            <LocationSettingsPanel locations={data.locations} weekStartDate={data.week.weekStartDate} />
          </div>
        </section>
      </section>
    </main>
  );
}

function ScheduleToolbar({
  filters,
  onFilterChange,
  onViewModeChange,
  resources,
  selectedDay,
  setSelectedDay,
  viewMode,
  weekDays
}: {
  filters: Filters;
  onFilterChange: (patch: Partial<Filters>) => void;
  onViewModeChange: (mode: ViewMode) => void;
  resources: {
    departments: ScheduleResourceOption[];
    locations: ScheduleWorkLocation[];
    programmes: ScheduleResourceOption[];
    staff: ScheduleStaffOption[];
  };
  selectedDay: string;
  setSelectedDay: (date: string) => void;
  viewMode: ViewMode;
  weekDays: string[];
}) {
  return (
    <section className="rounded-lg border border-line bg-paper p-4 shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-teal/10 text-teal">
            <Filter aria-hidden="true" className="size-5" />
          </span>
          <h2 className="text-lg font-semibold text-ink">Roster Filters</h2>
        </div>
        <div className="grid grid-cols-3 rounded-md border border-line bg-field p-1 text-sm font-semibold">
          {(["week", "day", "staff"] as ViewMode[]).map((mode) => (
            <button
              className={clsx(
                "h-9 rounded px-3 capitalize transition",
                viewMode === mode ? "bg-teal text-white" : "text-slate-600 hover:bg-orange-50 hover:text-teal"
              )}
              key={mode}
              onClick={() => onViewModeChange(mode)}
              type="button"
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <SelectField
          label="Location"
          onChange={(locationId) => onFilterChange({ locationId })}
          options={resources.locations.map(toOption)}
          value={filters.locationId}
        />
        <SelectField
          label="Department"
          onChange={(departmentId) => onFilterChange({ departmentId })}
          options={resources.departments.map(toOption)}
          value={filters.departmentId}
        />
        <SelectField
          label="Programme"
          onChange={(programmeId) => onFilterChange({ programmeId })}
          options={resources.programmes.map(toOption)}
          value={filters.programmeId}
        />
        <SelectField
          label="Role"
          onChange={(role) => onFilterChange({ role })}
          options={[
            { label: "Admin", value: "admin" },
            { label: "Lead coach", value: "lead_coach" },
            { label: "Coach", value: "coach" }
          ]}
          value={filters.role}
        />
        <SelectField
          label="Employee"
          onChange={(employeeId) => onFilterChange({ employeeId })}
          options={resources.staff.map((staff) => ({ label: getStaffName(staff), value: staff.id }))}
          value={filters.employeeId}
        />
        <SelectField
          label="Day"
          onChange={setSelectedDay}
          options={weekDays.map((date) => ({ label: formatDayLabel(date), value: date }))}
          value={selectedDay}
        />
      </div>
    </section>
  );
}

function WeekRosterGrid({
  isDragging,
  isPending,
  onDragState,
  onEdit,
  onMove,
  onResize,
  shifts,
  staff,
  weekDays,
  weekStartDate
}: RosterViewProps & {
  weekDays: string[];
}) {
  return (
    <section className="overflow-x-auto rounded-lg border border-line bg-paper shadow-panel">
      <div className="grid min-w-[1240px] grid-cols-[220px_repeat(7,minmax(145px,1fr))]">
        <div className="sticky left-0 top-0 z-20 border-b border-r border-line bg-paper p-3 text-xs font-semibold uppercase text-slate-500">
          Staff
        </div>
        {weekDays.map((date) => (
          <div className="border-b border-r border-line bg-paper p-3" key={date}>
            <p className="text-sm font-semibold text-ink">{formatDayLabel(date)}</p>
            <p className="text-xs text-slate-500">{date}</p>
          </div>
        ))}

        <RosterRow
          isDragging={isDragging}
          isPending={isPending}
          label="Open shifts"
          onDragState={onDragState}
          onEdit={onEdit}
          onMove={onMove}
          onResize={onResize}
          shifts={shifts}
          staffId=""
          weekDays={weekDays}
          weekStartDate={weekStartDate}
        />
        {staff.map((staffMember) => (
          <RosterRow
            isDragging={isDragging}
            isPending={isPending}
            key={staffMember.id}
            label={getStaffName(staffMember)}
            meta={formatStaffRole(staffMember.role)}
            onDragState={onDragState}
            onEdit={onEdit}
            onMove={onMove}
            onResize={onResize}
            shifts={shifts}
            staffId={staffMember.id}
            weekDays={weekDays}
            weekStartDate={weekStartDate}
          />
        ))}
      </div>
    </section>
  );
}

function RosterRow({
  isDragging,
  isPending,
  label,
  meta,
  onDragState,
  onEdit,
  onMove,
  onResize,
  shifts,
  staffId,
  weekDays,
  weekStartDate
}: {
  isDragging: boolean;
  isPending: boolean;
  label: string;
  meta?: string;
  onDragState: (shiftId: string | null) => void;
  onEdit: (shift: RosterShift) => void;
  onMove: (shiftId: string, targetDate: string, targetStaffProfileId: string) => void;
  onResize: (shiftId: string, minutes: number) => void;
  shifts: RosterShift[];
  staffId: string;
  weekDays: string[];
  weekStartDate: string;
}) {
  return (
    <>
      <div className="sticky left-0 z-10 border-b border-r border-line bg-paper p-3">
        <p className="truncate text-sm font-semibold text-ink">{label}</p>
        {meta ? <p className="mt-1 text-xs text-slate-500">{meta}</p> : null}
      </div>
      {weekDays.map((date) => {
        const cellShifts = shifts
          .filter((shift) => getShiftSingaporeDate(shift.startsAt) === date)
          .filter((shift) =>
            staffId
              ? shift.assignments.some((assignment) => assignment.staffProfileId === staffId)
              : shift.assignments.length === 0
          );

        return (
          <RosterDropCell
            date={date}
            isDragging={isDragging}
            isPending={isPending}
            key={`${staffId || "open"}-${date}`}
            onMove={onMove}
            staffId={staffId}
          >
            {cellShifts.map((shift) => (
              <ShiftCard
                key={shift.id}
                onDragState={onDragState}
                onEdit={onEdit}
                onResize={onResize}
                shift={shift}
                weekStartDate={weekStartDate}
              />
            ))}
          </RosterDropCell>
        );
      })}
    </>
  );
}

function DayRosterView(props: RosterViewProps & { date: string }) {
  const dayShifts = props.shifts.filter((shift) => getShiftSingaporeDate(shift.startsAt) === props.date);

  return (
    <section className="rounded-lg border border-line bg-paper shadow-panel">
      <PanelHeader icon={CalendarDays} title={formatDayLabel(props.date)} subtitle={`${dayShifts.length} shifts`} />
      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
        {props.staff.map((staff) => {
          const shifts = dayShifts.filter((shift) => shift.assignments.some((assignment) => assignment.staffProfileId === staff.id));

          return (
            <RosterDropCell
              date={props.date}
              isDragging={props.isDragging}
              isPending={props.isPending}
              key={staff.id}
              onMove={props.onMove}
              staffId={staff.id}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-ink">{getStaffName(staff)}</p>
                <span className="text-xs text-slate-500">{formatStaffRole(staff.role)}</span>
              </div>
              {shifts.map((shift) => (
                <ShiftCard
                  key={shift.id}
                  onDragState={props.onDragState}
                  onEdit={props.onEdit}
                  onResize={props.onResize}
                  shift={shift}
                  weekStartDate={props.weekStartDate}
                />
              ))}
            </RosterDropCell>
          );
        })}
      </div>
    </section>
  );
}

function StaffRosterView(props: RosterViewProps & { weekDays: string[] }) {
  return (
    <section className="rounded-lg border border-line bg-paper shadow-panel">
      <PanelHeader icon={Users} title="Staff View" subtitle={`${props.staff.length} staff shown`} />
      <div className="grid gap-3 p-4">
        {props.staff.map((staff) => {
          const staffShifts = props.shifts.filter((shift) => shift.assignments.some((assignment) => assignment.staffProfileId === staff.id));

          return (
            <article className="rounded-lg border border-line bg-field p-3" key={staff.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-ink">{getStaffName(staff)}</p>
                  <p className="text-xs text-slate-500">{formatStaffRole(staff.role)}</p>
                </div>
                <span className="text-sm font-semibold text-teal">{staffShifts.reduce((sum, shift) => sum + getRosterShiftHours(shift), 0).toFixed(2)}h</span>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-4">
                {props.weekDays.map((date) => (
                  <RosterDropCell
                    date={date}
                    isDragging={props.isDragging}
                    isPending={props.isPending}
                    key={`${staff.id}-${date}`}
                    onMove={props.onMove}
                    staffId={staff.id}
                  >
                    <p className="mb-2 text-xs font-semibold uppercase text-slate-500">{formatDayLabel(date)}</p>
                    {staffShifts
                      .filter((shift) => getShiftSingaporeDate(shift.startsAt) === date)
                      .map((shift) => (
                        <ShiftCard
                          key={shift.id}
                          onDragState={props.onDragState}
                          onEdit={props.onEdit}
                          onResize={props.onResize}
                          shift={shift}
                          weekStartDate={props.weekStartDate}
                        />
                      ))}
                  </RosterDropCell>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

type RosterViewProps = {
  isDragging: boolean;
  isPending: boolean;
  onDragState: (shiftId: string | null) => void;
  onEdit: (shift: RosterShift) => void;
  onMove: (shiftId: string, targetDate: string, targetStaffProfileId: string) => void;
  onResize: (shiftId: string, minutes: number) => void;
  shifts: RosterShift[];
  staff: ScheduleStaffOption[];
  weekStartDate: string;
};

function RosterDropCell({
  children,
  date,
  isDragging,
  isPending,
  onMove,
  staffId
}: {
  children: React.ReactNode;
  date: string;
  isDragging: boolean;
  isPending: boolean;
  onMove: (shiftId: string, targetDate: string, targetStaffProfileId: string) => void;
  staffId: string;
}) {
  const [isOver, setIsOver] = useState(false);

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const shiftId = event.dataTransfer.getData("text/plain");
    setIsOver(false);

    if (shiftId && !isPending) {
      onMove(shiftId, date, staffId);
    }
  }

  return (
    <div
      className={clsx(
        "relative min-h-32 border-b border-r border-line bg-field p-2 transition",
        isDragging && "bg-orange-50/40 outline outline-1 -outline-offset-4 outline-dashed outline-orange-300",
        isOver && "bg-orange-100 ring-2 ring-inset ring-teal"
      )}
      onDragLeave={() => setIsOver(false)}
      onDragOver={(event) => {
        event.preventDefault();
        setIsOver(true);
      }}
      onDrop={handleDrop}
    >
      {isDragging ? <span className="absolute right-2 top-2 block size-2 rounded-full bg-teal" /> : null}
      {children}
    </div>
  );
}

function ShiftCard({
  onDragState,
  onEdit,
  onResize,
  shift,
  weekStartDate
}: {
  onDragState: (shiftId: string | null) => void;
  onEdit: (shift: RosterShift) => void;
  onResize: (shiftId: string, minutes: number) => void;
  shift: RosterShift;
  weekStartDate: string;
}) {
  const assignedLabel = shift.assignments.map((assignment) => assignment.staffName).join(", ") || "Open";

  return (
    <article
      className="mb-2 cursor-grab select-none rounded-md border border-line bg-paper p-2 text-sm shadow-sm transition hover:-translate-y-0.5 hover:border-teal hover:shadow-panel active:cursor-grabbing"
      draggable
      onDragEnd={() => onDragState(null)}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", shift.id);
        onDragState(shift.id);
      }}
      style={{ borderLeft: `5px solid ${shift.colour}` }}
    >
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-teal/10 text-teal" title="Drag shift">
          <GripVertical aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words font-semibold text-ink">{shift.title}</p>
          <p className="mt-1 text-xs text-slate-600">
            {getShiftTimeRangeLabel(shift)} · {shift.locationName ?? "No location"}
          </p>
          <p className="mt-1 truncate text-xs text-slate-500">{assignedLabel}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          className="inline-flex size-8 items-center justify-center rounded-md border border-line bg-field text-slate-600 transition hover:border-teal hover:text-teal"
          onClick={() => onResize(shift.id, -15)}
          title="Shorten by 15 minutes"
          type="button"
        >
          <Minus aria-hidden="true" className="size-4" />
        </button>
        <button
          className="inline-flex size-8 items-center justify-center rounded-md border border-line bg-field text-slate-600 transition hover:border-teal hover:text-teal"
          onClick={() => onResize(shift.id, 15)}
          title="Extend by 15 minutes"
          type="button"
        >
          <Plus aria-hidden="true" className="size-4" />
        </button>
        <button
          className="inline-flex size-8 items-center justify-center rounded-md border border-line bg-field text-slate-600 transition hover:border-teal hover:text-teal"
          onClick={() => onEdit(shift)}
          title="Edit shift"
          type="button"
        >
          <FileText aria-hidden="true" className="size-4" />
        </button>
        <form action={duplicateShiftAction}>
          <input name="weekStartDate" type="hidden" value={weekStartDate} />
          <input name="shiftId" type="hidden" value={shift.id} />
          <button
            className="inline-flex size-8 items-center justify-center rounded-md border border-line bg-field text-slate-600 transition hover:border-teal hover:text-teal"
            title="Duplicate shift"
            type="submit"
          >
            <Copy aria-hidden="true" className="size-4" />
          </button>
        </form>
        <form action={cancelShiftAction}>
          <input name="weekStartDate" type="hidden" value={weekStartDate} />
          <input name="shiftId" type="hidden" value={shift.id} />
          <button
            className="inline-flex size-8 items-center justify-center rounded-md border border-line bg-field text-slate-600 transition hover:border-rose-400 hover:text-rose-700"
            title="Cancel shift"
            type="submit"
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
        </form>
      </div>
    </article>
  );
}

function ShiftFormPanel({
  departments,
  editingShift,
  locations,
  onClear,
  programmes,
  qualifications,
  staff,
  weekStartDate
}: {
  departments: ScheduleResourceOption[];
  editingShift: RosterShift | null;
  locations: ScheduleWorkLocation[];
  onClear: () => void;
  programmes: ScheduleResourceOption[];
  qualifications: ScheduleResourceOption[];
  staff: ScheduleStaffOption[];
  weekStartDate: string;
}) {
  const assignedStaffId = editingShift?.assignments[0]?.staffProfileId ?? "";
  const shiftDate = editingShift ? getShiftSingaporeDate(editingShift.startsAt) : weekStartDate;
  const formKey = editingShift
    ? `${editingShift.id}-${assignedStaffId || "open"}-${shiftDate}-${editingShift.startsAt}-${editingShift.endsAt}`
    : "new-shift";

  return (
    <section className="rounded-lg border border-line bg-paper shadow-panel">
      <PanelHeader
        icon={Plus}
        title={editingShift ? "Edit Shift" : "Add Shift"}
        subtitle={editingShift ? getShiftTimeRangeLabel(editingShift) : "Draft roster"}
      />
      <form action={saveShiftAction} className="grid gap-3 p-4" key={formKey}>
        <input name="shiftId" type="hidden" value={editingShift?.id ?? ""} />
        <TextField defaultValue={editingShift?.title ?? ""} label="Title" name="title" required />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField defaultValue={shiftDate} label="Date" name="shiftDate" required type="date" />
          <TextField defaultValue={editingShift?.sessionLabel ?? ""} label="Session" name="sessionLabel" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField defaultValue={editingShift ? getShiftSingaporeTime(editingShift.startsAt) : "08:00"} label="Start" name="startTime" required type="time" />
          <TextField defaultValue={editingShift ? getShiftSingaporeTime(editingShift.endsAt) : "10:30"} label="End" name="endTime" required type="time" />
        </div>
        <SelectField
          defaultLabel="Open shift"
          label="Staff"
          name="staffProfileId"
          options={staff.map((staffMember) => ({ label: getStaffName(staffMember), value: staffMember.id }))}
          value={assignedStaffId}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Location" name="workLocationId" options={locations.map(toOption)} value={editingShift?.workLocationId ?? ""} />
          <SelectField label="Programme" name="programmeId" options={programmes.map(toOption)} value={editingShift?.programmeId ?? ""} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Department" name="departmentId" options={departments.map(toOption)} value={editingShift?.departmentId ?? ""} />
          <SelectField
            label="Required role"
            name="requiredRole"
            options={[
              { label: "Admin", value: "admin" },
              { label: "Lead coach", value: "lead_coach" },
              { label: "Coach", value: "coach" }
            ]}
            value={editingShift?.requiredRole ?? ""}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Qualification"
            name="requiredQualificationId"
            options={qualifications.map(toOption)}
            value={editingShift?.requiredQualificationId ?? ""}
          />
          <TextField defaultValue={String(editingShift?.requiredManpower ?? 1)} label="Manpower" min="1" name="requiredManpower" required type="number" />
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-600">Colour</span>
          <div className="grid grid-cols-6 gap-2">
            {colourOptions.map((colour) => (
              <label className="relative block" key={colour}>
                <input
                  className="peer sr-only"
                  defaultChecked={(editingShift?.colour ?? colourOptions[0]) === colour}
                  name="colour"
                  type="radio"
                  value={colour}
                />
                <span
                  className="block h-9 rounded-md border border-line peer-checked:ring-2 peer-checked:ring-ink"
                  style={{ backgroundColor: colour }}
                />
              </label>
            ))}
          </div>
        </label>
        <TextAreaField defaultValue={editingShift?.notes ?? ""} label="Notes" name="notes" />
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal px-3 text-sm font-semibold text-white transition hover:bg-coral"
            type="submit"
          >
            <Save aria-hidden="true" className="size-4" />
            Save
          </button>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-field px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal"
            onClick={onClear}
            type="button"
          >
            <Check aria-hidden="true" className="size-4" />
            Clear
          </button>
        </div>
      </form>
    </section>
  );
}

function ScheduleActionsPanel({
  templates,
  weekDays,
  weekStartDate
}: {
  templates: Array<{ id: string; name: string }>;
  weekDays: string[];
  weekStartDate: string;
}) {
  return (
    <section className="rounded-lg border border-line bg-paper shadow-panel">
      <PanelHeader icon={ClipboardCopy} title="Week Actions" subtitle={getScheduleWeekLabel(weekStartDate)} />
      <div className="grid gap-3 p-4 lg:grid-cols-2 2xl:grid-cols-[minmax(170px,0.75fr)_minmax(170px,0.75fr)_minmax(260px,1.15fr)_minmax(240px,1fr)_minmax(240px,1fr)]">
        <form action={publishScheduleWeekAction} className="min-w-0">
          <input name="weekStartDate" type="hidden" value={weekStartDate} />
          <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-teal px-3 text-sm font-semibold text-white transition hover:bg-coral" type="submit">
            <Send aria-hidden="true" className="size-4" />
            Publish week
          </button>
        </form>
        <form action={copyWeekToNextWeekAction} className="min-w-0">
          <input name="weekStartDate" type="hidden" value={weekStartDate} />
          <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-line bg-field px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal" type="submit">
            <ChevronRight aria-hidden="true" className="size-4" />
            Copy to next week
          </button>
        </form>
        <form action={copyDayAction} className="grid min-w-0 gap-2 rounded-md border border-line bg-field p-3">
          <input name="weekStartDate" type="hidden" value={weekStartDate} />
          <div className="grid gap-2 sm:grid-cols-2">
            <SelectField label="From" name="sourceDate" options={weekDays.map((date) => ({ label: formatDayLabel(date), value: date }))} value={weekDays[0]} />
            <SelectField label="To" name="targetDate" options={weekDays.map((date) => ({ label: formatDayLabel(date), value: date }))} value={weekDays[1] ?? weekDays[0]} />
          </div>
          <button className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal" type="submit">
            <Copy aria-hidden="true" className="size-4" />
            Copy day
          </button>
        </form>
        <form action={saveWeekAsTemplateAction} className="grid min-w-0 gap-2 rounded-md border border-line bg-field p-3">
          <input name="weekStartDate" type="hidden" value={weekStartDate} />
          <TextField label="Template name" name="templateName" required />
          <button className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal" type="submit">
            <Save aria-hidden="true" className="size-4" />
            Save template
          </button>
        </form>
        {templates.length > 0 ? (
          <form action={applyTemplateAction} className="grid min-w-0 gap-2 rounded-md border border-line bg-field p-3">
            <input name="weekStartDate" type="hidden" value={weekStartDate} />
            <SelectField label="Template" name="templateId" options={templates.map((template) => ({ label: template.name, value: template.id }))} value={templates[0]?.id ?? ""} />
            <button className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal" type="submit">
              <ClipboardCopy aria-hidden="true" className="size-4" />
              Apply template
            </button>
          </form>
        ) : null}
      </div>
    </section>
  );
}

function OpenShiftsPanel({
  isPending,
  onDragState,
  onEdit,
  onResize,
  shifts,
  weekStartDate
}: {
  isPending: boolean;
  onDragState: (shiftId: string | null) => void;
  onEdit: (shift: RosterShift) => void;
  onResize: (shiftId: string, minutes: number) => void;
  shifts: RosterShift[];
  weekStartDate: string;
}) {
  return (
    <section className="rounded-lg border border-line bg-paper shadow-panel">
      <PanelHeader icon={Users} title="Open Shifts" subtitle={`${shifts.length} unassigned`} />
      <div className="grid gap-2 p-4">
        {shifts.length > 0 ? (
          shifts.map((shift) => (
            <ShiftCard
              key={shift.id}
              onDragState={onDragState}
              onEdit={onEdit}
              onResize={onResize}
              shift={shift}
              weekStartDate={weekStartDate}
            />
          ))
        ) : (
          <EmptyState text="No open shifts." />
        )}
      </div>
    </section>
  );
}

function LocationSettingsPanel({
  locations,
  weekStartDate
}: {
  locations: ScheduleWorkLocation[];
  weekStartDate: string;
}) {
  return (
    <section className="rounded-lg border border-line bg-paper shadow-panel">
      <PanelHeader icon={MapPin} title="Locations" subtitle="Geofence settings" />
      <div className="grid gap-3 p-4">
        {locations.map((location) => (
          <form action={updateWorkLocationAction} className="grid gap-2 rounded-md border border-line bg-field p-3" key={location.id}>
            <input name="weekStartDate" type="hidden" value={weekStartDate} />
            <input name="locationId" type="hidden" value={location.id} />
            <p className="font-semibold text-ink">{location.name}</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <TextField defaultValue={String(location.geofenceRadiusMeters)} label="Radius m" min="1" name="geofenceRadiusMeters" required type="number" />
              <TextField defaultValue={location.latitude?.toString() ?? ""} label="Latitude" name="latitude" />
              <TextField defaultValue={location.longitude?.toString() ?? ""} label="Longitude" name="longitude" />
            </div>
            <button className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal" type="submit">
              <Save aria-hidden="true" className="size-4" />
              Save
            </button>
          </form>
        ))}
      </div>
    </section>
  );
}

function ConflictPanel({ conflicts }: { conflicts: ScheduleConflictWarning[] }) {
  return (
    <section className="rounded-lg border border-line bg-paper shadow-panel">
      <PanelHeader icon={AlertTriangle} title="Conflict Warnings" subtitle={`${conflicts.length} active`} />
      {conflicts.length > 0 ? (
        <div className="grid gap-2 p-4">
          {conflicts.map((conflict) => (
            <div
              className={clsx(
                "rounded-md border px-3 py-2 text-sm font-medium",
                conflict.severity === "error"
                  ? "border-rose-200 bg-rose-50 text-rose-800"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              )}
              key={conflict.id}
            >
              {conflict.message}
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4">
          <EmptyState text="No conflicts for the current filters." />
        </div>
      )}
    </section>
  );
}

function PanelHeader({ icon: Icon, subtitle, title }: { icon: LucideIcon; subtitle: string; title: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-line px-4 py-3">
      <span className="flex size-9 items-center justify-center rounded-lg bg-teal/10 text-teal">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div className="min-w-0">
        <h2 className="truncate text-lg font-semibold text-ink">{title}</h2>
        <p className="truncate text-sm text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

function HeaderLink({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link
      className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal sm:flex-none"
      href={href}
    >
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </Link>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-line bg-paper p-4 shadow-panel">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-teal/10 text-teal">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
        </div>
      </div>
    </div>
  );
}

function StatusMessage({ message, tone }: { message: string; tone: "error" | "success" }) {
  return (
    <div
      className={clsx(
        "rounded-lg border px-4 py-3 text-sm font-medium shadow-panel",
        tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-amber-200 bg-amber-50 text-amber-900"
      )}
    >
      {message}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-paper px-4 py-8 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

function SelectField({
  defaultLabel = "All",
  label,
  name,
  onChange,
  options,
  value
}: {
  defaultLabel?: string;
  label: string;
  name?: string;
  onChange?: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      <select
        className="h-10 w-full rounded-md border border-line bg-field px-3 text-sm outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
        defaultValue={name ? value : undefined}
        name={name}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        value={onChange ? value : undefined}
      >
        <option value="">{defaultLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({
  defaultValue = "",
  label,
  min,
  name,
  required = false,
  type = "text"
}: {
  defaultValue?: string;
  label: string;
  min?: string;
  name: string;
  required?: boolean;
  type?: "date" | "number" | "text" | "time";
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      <input
        className="h-10 w-full rounded-md border border-line bg-field px-3 text-sm outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
        defaultValue={defaultValue}
        min={min}
        name={name}
        required={required}
        type={type}
      />
    </label>
  );
}

function TextAreaField({
  defaultValue = "",
  label,
  name
}: {
  defaultValue?: string;
  label: string;
  name: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      <textarea
        className="min-h-20 w-full resize-y rounded-md border border-line bg-field px-3 py-2 text-sm outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
        defaultValue={defaultValue}
        name={name}
      />
    </label>
  );
}

function shiftMatchesFilters(shift: RosterShift, filters: Filters) {
  if (filters.locationId && shift.workLocationId !== filters.locationId) {
    return false;
  }

  if (filters.departmentId && shift.departmentId !== filters.departmentId) {
    return false;
  }

  if (filters.programmeId && shift.programmeId !== filters.programmeId) {
    return false;
  }

  if (filters.employeeId && !shift.assignments.some((assignment) => assignment.staffProfileId === filters.employeeId)) {
    return false;
  }

  if (
    filters.role &&
    shift.requiredRole !== filters.role &&
    !shift.assignments.some((assignment) => assignment.staffRole === filters.role)
  ) {
    return false;
  }

  return true;
}

function conflictMatchesFilters(conflict: ScheduleConflictWarning, shifts: RosterShift[]) {
  if (!conflict.shiftId) {
    return true;
  }

  return shifts.some((shift) => shift.id === conflict.shiftId);
}

function toOption(resource: Pick<ScheduleResourceOption, "id" | "name">) {
  return {
    label: resource.name,
    value: resource.id
  };
}

function getStaffName(staff: ScheduleStaffOption) {
  return staff.fullName || staff.coachName || staff.email;
}

function formatStaffRole(role: StaffRole) {
  if (role === "lead_coach") {
    return "Lead coach";
  }

  return role.charAt(0).toUpperCase() + role.slice(1);
}

function formatDayLabel(date: string) {
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Singapore",
    weekday: "short"
  }).format(new Date(`${date}T00:00:00+08:00`));
}

function formatScheduleStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}
