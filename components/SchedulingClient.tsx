"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import clsx from "clsx";
import {
  ArrowLeft,
  Banknote,
  CalendarCheck,
  CheckCircle2,
  Clock,
  FileText,
  Navigation,
  Plus,
  Save,
  ShieldAlert,
  UserCheck,
  XCircle,
  type LucideIcon
} from "lucide-react";
import { SignOutButton } from "@/components/SignOutButton";
import {
  buildPayrollRows,
  canApproveLeaveRequest,
  centreLocations,
  createClockEvent,
  createInitialSchedulingState,
  createShift,
  getClockStatus,
  getLeaveReadinessLabel,
  getPayableHours,
  getScheduledHours,
  getStaffDisplayName,
  type AttendanceRecord,
  type ClockLocationStatus,
  type GeoPoint,
  type LeaveRequest,
  type LessonPlanMode,
  type ScheduledShift,
  type SchedulingState
} from "@/lib/scheduling";
import type { StaffProfile, StaffRole } from "@/lib/staffRoles";

type SchedulingClientProps = {
  canManageSchedule: boolean;
  staffProfile: StaffProfile;
};

type Message = {
  text: string;
  tone: "success" | "error";
};

type ShiftForm = {
  centreName: string;
  coachName: string;
  date: string;
  endTime: string;
  programme: string;
  sessionLabel: string;
  staffId: string;
  staffRole: StaffRole;
  startTime: string;
};

type LeaveForm = {
  coverCoachConfirmed: boolean;
  coverCoachId: string;
  coverCoachName: string;
  documentName: string;
  lessonPlanMode: LessonPlanMode;
  lessonPlanText: string;
  reason: string;
  shiftId: string;
};

const storageKey = "rdp-platform-scheduling.v1";
const today = new Date().toISOString().slice(0, 10);
const sessionOptions = ["Saturday AM", "Saturday PM", "Sunday AM", "Sunday PM", "Weekday PM"];
const programmeOptions = ["Learn to Swim", "Race Team", "Baby Class", "Social Swim Club"];

export function SchedulingClient({ canManageSchedule, staffProfile }: SchedulingClientProps) {
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [state, setState] = useState<SchedulingState>(() => createInitialSchedulingState(staffProfile));
  const [clockingShiftId, setClockingShiftId] = useState<string | null>(null);
  const [shiftForm, setShiftForm] = useState<ShiftForm>(() => ({
    centreName: centreLocations[0].centreName,
    coachName: "",
    date: today,
    endTime: "10:30",
    programme: programmeOptions[0],
    sessionLabel: sessionOptions[0],
    staffId: "",
    staffRole: "coach",
    startTime: "08:00"
  }));
  const [leaveForm, setLeaveForm] = useState<LeaveForm>(() => ({
    coverCoachConfirmed: false,
    coverCoachId: "",
    coverCoachName: "",
    documentName: "",
    lessonPlanMode: "text",
    lessonPlanText: "",
    reason: "",
    shiftId: ""
  }));

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);

    if (stored) {
      try {
        const parsed = JSON.parse(stored) as SchedulingState;

        if (Array.isArray(parsed.shifts) && Array.isArray(parsed.attendance) && Array.isArray(parsed.leaveRequests)) {
          setState(ensureCurrentStaffShift(parsed, staffProfile));
        }
      } catch {
        setMessage({ tone: "error", text: "Saved scheduling data could not be loaded." });
      }
    }

    setReady(true);
  }, [staffProfile]);

  useEffect(() => {
    if (ready) {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    }
  }, [ready, state]);

  const staffName = getStaffDisplayName(staffProfile);
  const ownShifts = useMemo(
    () => state.shifts.filter((shift) => shift.staffId === staffProfile.id).sort(sortShiftsAsc),
    [staffProfile.id, state.shifts]
  );
  const visibleShifts = useMemo(
    () => (canManageSchedule ? state.shifts : ownShifts).sort(sortShiftsAsc),
    [canManageSchedule, ownShifts, state.shifts]
  );
  const staffOptions = useMemo(() => getStaffOptions(state.shifts, staffProfile), [staffProfile, state.shifts]);
  const ownLeaveRequests = useMemo(
    () => state.leaveRequests.filter((request) => request.staffId === staffProfile.id).sort(sortLeaveRequestsDesc),
    [staffProfile.id, state.leaveRequests]
  );
  const visibleLeaveRequests = useMemo(
    () => (canManageSchedule ? state.leaveRequests : ownLeaveRequests).sort(sortLeaveRequestsDesc),
    [canManageSchedule, ownLeaveRequests, state.leaveRequests]
  );
  const visiblePayrollRows = useMemo(
    () =>
      buildPayrollRows(visibleShifts, state.attendance).sort(
        (first, second) => first.date.localeCompare(second.date) || first.coachName.localeCompare(second.coachName)
      ),
    [state.attendance, visibleShifts]
  );
  const totals = useMemo(() => {
    const attendanceIssues = visiblePayrollRows.filter(
      (row) => row.clockStatus === "outside_geofence" || row.clockStatus === "location_unavailable"
    ).length;

    return {
      attendanceIssues,
      payableHours: visiblePayrollRows.reduce((sum, row) => sum + row.payableHours, 0),
      pendingLeave: visibleLeaveRequests.filter((request) => request.status === "pending").length,
      todayShifts: visibleShifts.filter((shift) => shift.date === today).length
    };
  }, [visibleLeaveRequests, visiblePayrollRows, visibleShifts]);

  useEffect(() => {
    if (!leaveForm.shiftId && ownShifts[0]) {
      setLeaveForm((current) => ({ ...current, shiftId: ownShifts[0].id }));
    }
  }, [leaveForm.shiftId, ownShifts]);

  async function clockShift(shift: ScheduledShift, direction: "in" | "out") {
    setClockingShiftId(shift.id);
    setMessage({ tone: "success", text: "Requesting browser location..." });

    const location = await getBrowserLocation();
    const event = createClockEvent(location, shift.expectedLocation);

    setState((currentState) => {
      const existing = currentState.attendance.find((record) => record.shiftId === shift.id);
      const nextRecord: AttendanceRecord = {
        clockIn: direction === "in" ? event : existing?.clockIn ?? null,
        clockOut: direction === "out" ? event : existing?.clockOut ?? null,
        id: existing?.id ?? createClientId(),
        shiftId: shift.id,
        staffId: shift.staffId
      };

      return {
        ...currentState,
        attendance: existing
          ? currentState.attendance.map((record) => (record.id === existing.id ? nextRecord : record))
          : [nextRecord, ...currentState.attendance]
      };
    });

    setClockingShiftId(null);
    setMessage({
      tone: event.locationStatus === "inside_geofence" ? "success" : "error",
      text:
        event.locationStatus === "inside_geofence"
          ? `Clock ${direction} recorded within ${shift.centreName}.`
          : `Clock ${direction} recorded, but location needs review.`
    });
  }

  function addShift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const coachName = shiftForm.coachName.trim();

    if (!coachName || !shiftForm.date || !shiftForm.startTime || !shiftForm.endTime) {
      setMessage({ tone: "error", text: "Complete coach, date, start, and end time." });
      return;
    }

    const staffId = shiftForm.staffId.trim() || slugifyId(coachName);
    const shift = createShift({
      centreName: shiftForm.centreName,
      coachName,
      date: shiftForm.date,
      endTime: shiftForm.endTime,
      id: createClientId(),
      programme: shiftForm.programme,
      sessionLabel: shiftForm.sessionLabel,
      staffId,
      staffRole: shiftForm.staffRole,
      startTime: shiftForm.startTime
    });

    setState((currentState) => ({
      ...currentState,
      shifts: [shift, ...currentState.shifts]
    }));
    setShiftForm((current) => ({ ...current, coachName: "", staffId: "" }));
    setMessage({ tone: "success", text: "Shift added." });
  }

  function submitLeaveRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const shift = state.shifts.find((item) => item.id === leaveForm.shiftId);

    if (!shift) {
      setMessage({ tone: "error", text: "Select a shift for leave." });
      return;
    }

    if (!leaveForm.reason.trim()) {
      setMessage({ tone: "error", text: "Enter a leave reason." });
      return;
    }

    if (!leaveForm.coverCoachId || !leaveForm.coverCoachName) {
      setMessage({ tone: "error", text: "Select a cover coach." });
      return;
    }

    const request: LeaveRequest = {
      coverCoachConfirmed: leaveForm.coverCoachConfirmed,
      coverCoachId: leaveForm.coverCoachId,
      coverCoachName: leaveForm.coverCoachName,
      createdAt: new Date().toISOString(),
      documentName: leaveForm.documentName,
      id: createClientId(),
      lessonPlanMode: leaveForm.lessonPlanMode,
      lessonPlanText: leaveForm.lessonPlanText,
      reason: leaveForm.reason.trim(),
      reviewedAt: null,
      reviewerNote: "",
      shiftId: shift.id,
      staffId: staffProfile.id,
      status: "pending"
    };

    setState((currentState) => ({
      ...currentState,
      leaveRequests: [request, ...currentState.leaveRequests]
    }));
    setLeaveForm((current) => ({
      ...current,
      coverCoachConfirmed: false,
      documentName: "",
      lessonPlanText: "",
      reason: ""
    }));
    setMessage({ tone: "success", text: "Leave request submitted for approval." });
  }

  function reviewLeaveRequest(requestId: string, status: "approved" | "rejected") {
    setState((currentState) => ({
      ...currentState,
      leaveRequests: currentState.leaveRequests.map((request) =>
        request.id === requestId
          ? {
              ...request,
              reviewedAt: new Date().toISOString(),
              reviewerNote:
                status === "approved"
                  ? "Cover coach and lesson plan confirmed."
                  : "Rejected by admin.",
              status
            }
          : request
      ),
      shifts:
        status === "approved"
          ? currentState.shifts.map((shift) => {
              const request = currentState.leaveRequests.find((item) => item.id === requestId);

              return request?.shiftId === shift.id ? { ...shift, status: "covered" } : shift;
            })
          : currentState.shifts
    }));
    setMessage({ tone: "success", text: status === "approved" ? "Leave approved." : "Leave rejected." });
  }

  return (
    <main className="mx-auto flex min-w-0 w-full max-w-[1500px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex min-w-0 flex-col gap-4 rounded-lg border border-line bg-paper p-4 shadow-panel lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase text-teal">Red Dot Penguins</p>
          <h1 className="mt-1 break-words text-2xl font-semibold text-ink sm:text-3xl">
            Scheduling and Attendance
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            {canManageSchedule ? "Roster, attendance, leave, and payroll review." : `${staffName}'s roster and clock records.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:w-auto">
          <HeaderLink href={canManageSchedule ? "/admin" : "/dashboard"} icon={ArrowLeft} label={canManageSchedule ? "Admin home" : "Dashboard"} />
          <SignOutButton className="flex-1 sm:flex-none" />
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={CalendarCheck} label="Today shifts" value={totals.todayShifts} />
        <MetricCard icon={FileText} label="Pending leave" value={totals.pendingLeave} />
        <MetricCard icon={ShieldAlert} label="Location review" value={totals.attendanceIssues} />
        <MetricCard icon={Banknote} label="Payable hours" value={totals.payableHours.toFixed(2)} />
      </section>

      {message ? <StatusMessage message={message.text} tone={message.tone} /> : null}

      <section className="rounded-lg border border-line bg-paper p-4 text-sm text-slate-600 shadow-panel">
        Location is captured only when staff press clock-in or clock-out. Centre coordinates here are prototype values and must be replaced with confirmed pool coordinates before payroll use.
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <ClockPanel
          attendance={state.attendance}
          clockingShiftId={clockingShiftId}
          onClock={clockShift}
          shifts={ownShifts}
        />
        <LeaveRequestPanel
          coverOptions={staffOptions.filter((staff) => staff.id !== staffProfile.id)}
          form={leaveForm}
          onFileChange={(event) => {
            const file = event.target.files?.[0];
            setLeaveForm((current) => ({ ...current, documentName: file?.name ?? "" }));
          }}
          onFormChange={(patch) => setLeaveForm((current) => ({ ...current, ...patch }))}
          onSubmit={submitLeaveRequest}
          shifts={ownShifts}
        />
      </section>

      {canManageSchedule ? (
        <section className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
          <RosterBuilderPanel
            form={shiftForm}
            onFormChange={(patch) => setShiftForm((current) => ({ ...current, ...patch }))}
            onSubmit={addShift}
          />
          <LeaveApprovalPanel
            requests={visibleLeaveRequests}
            shifts={state.shifts}
            staffOptions={staffOptions}
            onReview={reviewLeaveRequest}
          />
        </section>
      ) : null}

      <AttendancePayrollPanel
        attendance={state.attendance}
        canManageSchedule={canManageSchedule}
        shifts={visibleShifts}
      />
    </main>
  );
}

function ClockPanel({
  attendance,
  clockingShiftId,
  onClock,
  shifts
}: {
  attendance: AttendanceRecord[];
  clockingShiftId: string | null;
  onClock: (shift: ScheduledShift, direction: "in" | "out") => void;
  shifts: ScheduledShift[];
}) {
  return (
    <section className="rounded-lg border border-line bg-paper shadow-panel">
      <PanelHeader icon={Clock} title="My clock" subtitle={`${shifts.length} rostered shifts`} />
      <div className="grid gap-3 p-4">
        {shifts.length > 0 ? (
          shifts.map((shift) => {
            const record = attendance.find((item) => item.shiftId === shift.id);
            const status = getClockStatus(record);

            return (
              <article className="rounded-lg border border-line bg-field p-4" key={shift.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{shift.date} · {shift.sessionLabel}</p>
                    <p className="text-sm text-slate-600">
                      {shift.startTime}-{shift.endTime} · {shift.centreName} · {shift.programme}
                    </p>
                  </div>
                  <ClockStatusPill status={status} />
                </div>
                <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                  <MetaBox label="Clock in" value={record?.clockIn ? formatDateTime(record.clockIn.at) : "Not clocked"} />
                  <MetaBox label="Clock out" value={record?.clockOut ? formatDateTime(record.clockOut.at) : "Not clocked"} />
                  <MetaBox label="Distance" value={formatDistance(record?.clockIn?.distanceMeters)} />
                  <MetaBox label="Payable" value={`${getPayableHours(record, shift).toFixed(2)}h`} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal px-3 text-sm font-semibold text-white transition hover:bg-teal/90 disabled:cursor-not-allowed disabled:bg-slate-300"
                    disabled={Boolean(record?.clockIn) || clockingShiftId === shift.id}
                    onClick={() => onClock(shift, "in")}
                    type="button"
                  >
                    <Navigation aria-hidden="true" className="size-4" />
                    Clock in
                  </button>
                  <button
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    disabled={!record?.clockIn || Boolean(record?.clockOut) || clockingShiftId === shift.id}
                    onClick={() => onClock(shift, "out")}
                    type="button"
                  >
                    <CheckCircle2 aria-hidden="true" className="size-4" />
                    Clock out
                  </button>
                </div>
              </article>
            );
          })
        ) : (
          <EmptyState text="No rostered shifts yet." />
        )}
      </div>
    </section>
  );
}

function LeaveRequestPanel({
  coverOptions,
  form,
  onFileChange,
  onFormChange,
  onSubmit,
  shifts
}: {
  coverOptions: Array<{ id: string; name: string; role: StaffRole }>;
  form: LeaveForm;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onFormChange: (patch: Partial<LeaveForm>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  shifts: ScheduledShift[];
}) {
  const selectedCover = coverOptions.find((option) => option.id === form.coverCoachId);

  return (
    <section className="rounded-lg border border-line bg-paper shadow-panel">
      <PanelHeader icon={FileText} title="Leave request" subtitle="Cover coach and lesson plan required" />
      <form className="grid gap-3 p-4" onSubmit={onSubmit}>
        <SelectField
          label="Shift"
          onChange={(shiftId) => onFormChange({ shiftId })}
          options={shifts.map((shift) => ({
            label: `${shift.date} ${shift.sessionLabel} · ${shift.centreName}`,
            value: shift.id
          }))}
          value={form.shiftId}
        />
        <TextAreaField label="Reason" onChange={(reason) => onFormChange({ reason })} value={form.reason} />
        <SelectField
          label="Cover coach"
          onChange={(coverCoachId) =>
            onFormChange({
              coverCoachId,
              coverCoachName: coverOptions.find((option) => option.id === coverCoachId)?.name ?? ""
            })
          }
          options={coverOptions.map((option) => ({ label: `${option.name} (${formatStaffRole(option.role)})`, value: option.id }))}
          value={form.coverCoachId}
        />
        <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
          <input
            checked={form.coverCoachConfirmed}
            disabled={!selectedCover}
            onChange={(event) => onFormChange({ coverCoachConfirmed: event.target.checked })}
            type="checkbox"
          />
          Cover coach confirmed
        </label>
        <div className="grid grid-cols-2 gap-2">
          <ModeButton active={form.lessonPlanMode === "text"} label="Text plan" onClick={() => onFormChange({ lessonPlanMode: "text" })} />
          <ModeButton active={form.lessonPlanMode === "document"} label="Document" onClick={() => onFormChange({ lessonPlanMode: "document" })} />
        </div>
        {form.lessonPlanMode === "text" ? (
          <TextAreaField
            label="Lesson plan"
            onChange={(lessonPlanText) => onFormChange({ lessonPlanText })}
            value={form.lessonPlanText}
          />
        ) : (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-600">Lesson plan document</span>
            <input
              className="w-full rounded-md border border-line bg-field px-3 py-2 text-sm outline-none transition file:mr-3 file:rounded-md file:border-0 file:bg-teal file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white focus:border-teal focus:ring-2 focus:ring-teal/20"
              onChange={onFileChange}
              type="file"
            />
            {form.documentName ? <span className="mt-1 block text-xs text-slate-500">{form.documentName}</span> : null}
          </label>
        )}
        <button
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal px-3 text-sm font-semibold text-white transition hover:bg-teal/90"
          type="submit"
        >
          <Save aria-hidden="true" className="size-4" />
          Submit leave
        </button>
      </form>
    </section>
  );
}

function RosterBuilderPanel({
  form,
  onFormChange,
  onSubmit
}: {
  form: ShiftForm;
  onFormChange: (patch: Partial<ShiftForm>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section className="rounded-lg border border-line bg-paper shadow-panel">
      <PanelHeader icon={Plus} title="Add shift" subtitle="Admin roster planning" />
      <form className="grid gap-3 p-4" onSubmit={onSubmit}>
        <TextField label="Coach name" onChange={(coachName) => onFormChange({ coachName })} value={form.coachName} />
        <TextField label="Staff ID" onChange={(staffId) => onFormChange({ staffId })} value={form.staffId} />
        <SelectField
          label="Role"
          onChange={(staffRole) => onFormChange({ staffRole: staffRole as StaffRole })}
          options={[
            { label: "Lead coach", value: "lead_coach" },
            { label: "Coach", value: "coach" },
            { label: "Admin", value: "admin" }
          ]}
          value={form.staffRole}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Centre"
            onChange={(centreName) => onFormChange({ centreName })}
            options={centreLocations.map((location) => location.centreName)}
            value={form.centreName}
          />
          <SelectField
            label="Programme"
            onChange={(programme) => onFormChange({ programme })}
            options={programmeOptions}
            value={form.programme}
          />
        </div>
        <TextField label="Date" onChange={(date) => onFormChange({ date })} type="date" value={form.date} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Start" onChange={(startTime) => onFormChange({ startTime })} type="time" value={form.startTime} />
          <TextField label="End" onChange={(endTime) => onFormChange({ endTime })} type="time" value={form.endTime} />
        </div>
        <SelectField
          label="Session"
          onChange={(sessionLabel) => onFormChange({ sessionLabel })}
          options={sessionOptions}
          value={form.sessionLabel}
        />
        <button
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal px-3 text-sm font-semibold text-white transition hover:bg-teal/90"
          type="submit"
        >
          <Plus aria-hidden="true" className="size-4" />
          Add shift
        </button>
      </form>
    </section>
  );
}

function LeaveApprovalPanel({
  onReview,
  requests,
  shifts,
  staffOptions
}: {
  onReview: (requestId: string, status: "approved" | "rejected") => void;
  requests: LeaveRequest[];
  shifts: ScheduledShift[];
  staffOptions: Array<{ id: string; name: string; role: StaffRole }>;
}) {
  return (
    <section className="rounded-lg border border-line bg-paper shadow-panel">
      <PanelHeader icon={UserCheck} title="Leave approvals" subtitle={`${requests.filter((request) => request.status === "pending").length} pending`} />
      <div className="grid gap-3 p-4">
        {requests.length > 0 ? (
          requests.map((request) => {
            const shift = shifts.find((item) => item.id === request.shiftId);
            const requester = staffOptions.find((staff) => staff.id === request.staffId);
            const ready = canApproveLeaveRequest(request);

            return (
              <article className="rounded-lg border border-line bg-field p-4" key={request.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{requester?.name ?? request.staffId}</p>
                    <p className="text-sm text-slate-600">
                      {shift ? `${shift.date} ${shift.sessionLabel} · ${shift.centreName}` : "Shift not found"}
                    </p>
                  </div>
                  <LeaveStatusPill status={request.status} />
                </div>
                <p className="mt-3 text-sm text-slate-600">{request.reason}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <MetaBox label="Cover coach" value={request.coverCoachName || "-"} />
                  <MetaBox label="Cover confirmed" value={request.coverCoachConfirmed ? "Yes" : "No"} />
                  <MetaBox label="Lesson plan" value={request.lessonPlanMode === "document" ? request.documentName || "-" : "Text submitted"} />
                </div>
                <p className={clsx("mt-3 text-sm font-semibold", ready ? "text-emerald-700" : "text-amber-800")}>
                  {getLeaveReadinessLabel(request)}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-teal px-3 text-sm font-semibold text-white transition hover:bg-teal/90 disabled:cursor-not-allowed disabled:bg-slate-300"
                    disabled={!ready}
                    onClick={() => onReview(request.id, "approved")}
                    type="button"
                  >
                    <CheckCircle2 aria-hidden="true" className="size-4" />
                    Approve
                  </button>
                  <button
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-rose-400 hover:text-rose-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    disabled={request.status !== "pending"}
                    onClick={() => onReview(request.id, "rejected")}
                    type="button"
                  >
                    <XCircle aria-hidden="true" className="size-4" />
                    Reject
                  </button>
                </div>
              </article>
            );
          })
        ) : (
          <EmptyState text="No leave requests yet." />
        )}
      </div>
    </section>
  );
}

function AttendancePayrollPanel({
  attendance,
  canManageSchedule,
  shifts
}: {
  attendance: AttendanceRecord[];
  canManageSchedule: boolean;
  shifts: ScheduledShift[];
}) {
  const rows = buildPayrollRows(shifts, attendance);

  return (
    <section className="rounded-lg border border-line bg-paper shadow-panel">
      <PanelHeader
        icon={Banknote}
        title={canManageSchedule ? "Attendance and payroll" : "My attendance"}
        subtitle={`${rows.length} shifts shown`}
      />
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-10 bg-paper text-xs uppercase text-slate-500">
            <tr>
              {["Coach", "Date", "Centre", "Scheduled", "Clock status", "Payable", "Clock in", "Clock out"].map((heading) => (
                <th className="border-b border-line px-4 py-3 font-semibold" key={heading}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shifts.map((shift) => {
              const record = attendance.find((item) => item.shiftId === shift.id);
              const clockStatus = getClockStatus(record);

              return (
                <tr className="align-top" key={shift.id}>
                  <td className="border-b border-line px-4 py-3 font-semibold text-ink">{shift.coachName}</td>
                  <td className="border-b border-line px-4 py-3 text-slate-600">{shift.date}</td>
                  <td className="border-b border-line px-4 py-3 text-slate-600">{shift.centreName}</td>
                  <td className="border-b border-line px-4 py-3 text-slate-600">{getScheduledHours(shift).toFixed(2)}h</td>
                  <td className="border-b border-line px-4 py-3"><ClockStatusPill status={clockStatus} /></td>
                  <td className="border-b border-line px-4 py-3 text-slate-600">{getPayableHours(record, shift).toFixed(2)}h</td>
                  <td className="border-b border-line px-4 py-3 text-slate-600">
                    {record?.clockIn ? `${formatDateTime(record.clockIn.at)} (${formatDistance(record.clockIn.distanceMeters)})` : "-"}
                  </td>
                  <td className="border-b border-line px-4 py-3 text-slate-600">
                    {record?.clockOut ? `${formatDateTime(record.clockOut.at)} (${formatDistance(record.clockOut.distanceMeters)})` : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PanelHeader({ icon: Icon, subtitle, title }: { icon: LucideIcon; subtitle: string; title: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-line px-4 py-3">
      <span className="flex size-9 items-center justify-center rounded-lg bg-teal/10 text-teal">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div>
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <p className="text-sm text-slate-500">{subtitle}</p>
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

function StatusMessage({ message, tone }: { message: string; tone: "success" | "error" }) {
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

function MetaBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-paper px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 break-words font-semibold text-ink">{value}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-field px-4 py-8 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

function ClockStatusPill({ status }: { status: ClockLocationStatus | "not_clocked" }) {
  const config = {
    inside_geofence: ["Inside geofence", "border-emerald-200 bg-emerald-100 text-emerald-900"],
    location_unavailable: ["No location", "border-amber-200 bg-amber-100 text-amber-950"],
    not_clocked: ["Not clocked", "border-slate-200 bg-slate-100 text-slate-700"],
    outside_geofence: ["Review location", "border-orange-200 bg-orange-100 text-orange-900"]
  } as const;
  const [label, className] = config[status];

  return <span className={clsx("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", className)}>{label}</span>;
}

function LeaveStatusPill({ status }: { status: LeaveRequest["status"] }) {
  const config = {
    approved: ["Approved", "border-emerald-200 bg-emerald-100 text-emerald-900"],
    draft: ["Draft", "border-slate-200 bg-slate-100 text-slate-700"],
    pending: ["Pending", "border-amber-200 bg-amber-100 text-amber-950"],
    rejected: ["Rejected", "border-rose-200 bg-rose-100 text-rose-800"]
  } as const;
  const [label, className] = config[status];

  return <span className={clsx("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", className)}>{label}</span>;
}

function ModeButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={clsx(
        "h-9 rounded-md px-3 text-sm font-semibold transition",
        active ? "bg-teal text-white" : "border border-line bg-paper text-slate-700 hover:border-teal hover:text-teal"
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function SelectField({
  label,
  onChange,
  options,
  value
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }> | string[];
  value: string;
}) {
  const normalizedOptions = options.map((option) =>
    typeof option === "string" ? { label: option, value: option } : option
  );

  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      <select
        className="h-10 w-full rounded-md border border-line bg-field px-3 text-sm outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">Select</option>
        {normalizedOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({
  label,
  onChange,
  type = "text",
  value
}: {
  label: string;
  onChange: (value: string) => void;
  type?: "date" | "text" | "time";
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      <input
        className="h-10 w-full rounded-md border border-line bg-field px-3 text-sm outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
    </label>
  );
}

function TextAreaField({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      <textarea
        className="min-h-24 w-full resize-y rounded-md border border-line bg-field px-3 py-2 text-sm outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

async function getBrowserLocation(): Promise<GeoPoint | null> {
  if (!("geolocation" in navigator)) {
    return null;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          accuracyMeters: position.coords.accuracy,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        }),
      () => resolve(null),
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000
      }
    );
  });
}

function ensureCurrentStaffShift(state: SchedulingState, staffProfile: StaffProfile) {
  if (state.shifts.some((shift) => shift.staffId === staffProfile.id)) {
    return state;
  }

  return createInitialSchedulingState(staffProfile);
}

function getStaffOptions(shifts: ScheduledShift[], staffProfile: StaffProfile) {
  const staff = new Map<string, { id: string; name: string; role: StaffRole }>();

  staff.set(staffProfile.id, {
    id: staffProfile.id,
    name: getStaffDisplayName(staffProfile),
    role: staffProfile.role
  });

  shifts.forEach((shift) => {
    staff.set(shift.staffId, {
      id: shift.staffId,
      name: shift.coachName,
      role: shift.staffRole
    });
  });

  return Array.from(staff.values()).sort((first, second) => first.name.localeCompare(second.name));
}

function sortShiftsAsc(first: ScheduledShift, second: ScheduledShift) {
  return `${first.date}T${first.startTime}`.localeCompare(`${second.date}T${second.startTime}`);
}

function sortLeaveRequestsDesc(first: LeaveRequest, second: LeaveRequest) {
  return second.createdAt.localeCompare(first.createdAt);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatDistance(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }

  return value >= 1000 ? `${(value / 1000).toFixed(2)}km` : `${value}m`;
}

function formatStaffRole(role: StaffRole) {
  if (role === "lead_coach") {
    return "Lead coach";
  }

  return role.charAt(0).toUpperCase() + role.slice(1);
}

function slugifyId(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug ? `staff-${slug}` : createClientId();
}

function createClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `schedule-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
