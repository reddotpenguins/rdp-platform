"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  ArrowLeft,
  Award,
  BookOpenCheck,
  CalendarPlus,
  ClipboardCheck,
  GraduationCap,
  Network,
  Save,
  Search,
  ShieldAlert,
  TrendingUp,
  UserCheck,
  type LucideIcon
} from "lucide-react";
import { SignOutButton } from "@/components/SignOutButton";
import {
  attachmentRequiredHours,
  formatTraineeStage,
  getCoachPassRate,
  getCoachRecommendation,
  getCoachSignal,
  getTraineeCompletedHours,
  getTraineeNextStep,
  getTraineeProgress,
  initialTrainingTrainees,
  trainingCoaches,
  type AttendanceStatus,
  type CoachSignal,
  type TraineeStage,
  type TrainingAttendanceEntry,
  type TrainingCoachProfile,
  type TrainingTrainee
} from "@/lib/trainingDashboard";

type SignalFilter = "all" | CoachSignal | "attachment" | "shadowing";

const storageKey = "rdp-platform-training.v1";
const roleOrder: Record<TrainingCoachProfile["role"], number> = {
  "Chief Trainer": 10,
  "Lead Coach": 20,
  "Senior Coach": 30,
  Coach: 40
};

const sessionOptions = ["Saturday AM", "Saturday PM", "Sunday AM", "Sunday PM", "Weekday PM"];
const attendanceStatuses: AttendanceStatus[] = ["attended", "makeup_required", "absent"];
const traineeStages: TraineeStage[] = ["attachment", "second_interview", "shadowing", "cleared"];

export function TrainingDashboardClient() {
  const [ready, setReady] = useState(false);
  const [trainees, setTrainees] = useState<TrainingTrainee[]>(initialTrainingTrainees);
  const [centreFilter, setCentreFilter] = useState("All");
  const [signalFilter, setSignalFilter] = useState<SignalFilter>("all");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [attendanceForm, setAttendanceForm] = useState(() => ({
    coachId: initialTrainingTrainees[0]?.mentorCoachId ?? trainingCoaches[0].id,
    date: new Date().toISOString().slice(0, 10),
    focus: "",
    hours: "2",
    session: sessionOptions[0],
    status: "attended" as AttendanceStatus,
    traineeId: initialTrainingTrainees[0]?.id ?? ""
  }));

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);

    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { trainees?: TrainingTrainee[] };

        if (Array.isArray(parsed.trainees)) {
          setTrainees(parsed.trainees);
        }
      } catch {
        setMessage({ tone: "error", text: "Training tracker data could not be loaded." });
      }
    }

    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) {
      window.localStorage.setItem(storageKey, JSON.stringify({ trainees }));
    }
  }, [ready, trainees]);

  const centreOptions = useMemo(() => getCentreOptions(trainees), [trainees]);
  const visibleCoaches = useMemo(
    () =>
      trainingCoaches
        .filter((coach) => centreFilter === "All" || coach.centres.includes("All") || coach.centres.includes(centreFilter))
        .filter((coach) => filterCoachBySignal(coach, signalFilter))
        .filter((coach) => {
          const query = search.trim().toLowerCase();

          if (!query) return true;

          return [coach.name, coach.role, coach.centres.join(" "), coach.programmes.join(" "), getCoachRecommendation(coach)]
            .join(" ")
            .toLowerCase()
            .includes(query);
        })
        .sort((first, second) => roleOrder[first.role] - roleOrder[second.role] || first.name.localeCompare(second.name)),
    [centreFilter, search, signalFilter]
  );
  const totals = useMemo(
    () => ({
      attention: trainingCoaches.filter((coach) => getCoachSignal(coach) === "attention").length,
      celebration: trainingCoaches.filter((coach) => getCoachSignal(coach) === "celebrate").length,
      hostReady: trainingCoaches.filter((coach) => coach.attachmentHost || coach.shadowingHost).length,
      interviewReady: trainees.filter(
        (trainee) => trainee.stage === "attachment" && getTraineeCompletedHours(trainee) >= attachmentRequiredHours
      ).length,
      trainees: trainees.length
    }),
    [trainees]
  );
  const recentAttendance = useMemo(
    () =>
      trainees
        .flatMap((trainee) =>
          trainee.attendance.map((entry) => ({
            ...entry,
            traineeName: trainee.name
          }))
        )
        .sort((first, second) => second.date.localeCompare(first.date))
        .slice(0, 6),
    [trainees]
  );

  function addAttendance(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const hours = Number(attendanceForm.hours);

    if (!attendanceForm.traineeId || !attendanceForm.coachId) {
      setMessage({ tone: "error", text: "Select a trainee and host coach." });
      return;
    }

    if (!Number.isFinite(hours) || hours < 0 || hours > 12) {
      setMessage({ tone: "error", text: "Hours should be between 0 and 12." });
      return;
    }

    const entry: TrainingAttendanceEntry = {
      coachId: attendanceForm.coachId,
      date: attendanceForm.date,
      focus: attendanceForm.focus.trim() || "Attachment observation",
      hours: attendanceForm.status === "attended" ? hours : 0,
      id: createClientId(),
      session: attendanceForm.session,
      status: attendanceForm.status
    };

    setTrainees((current) =>
      current.map((trainee) =>
        trainee.id === attendanceForm.traineeId
          ? {
              ...trainee,
              attendance: [entry, ...trainee.attendance]
            }
          : trainee
      )
    );
    setAttendanceForm((current) => ({ ...current, focus: "", hours: "2" }));
    setMessage({ tone: "success", text: "Attendance logged." });
  }

  function updateTrainee(traineeId: string, patch: Partial<TrainingTrainee>) {
    setTrainees((current) =>
      current.map((trainee) => (trainee.id === traineeId ? { ...trainee, ...patch } : trainee))
    );
  }

  return (
    <main className="mx-auto flex min-w-0 w-full max-w-[1500px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex min-w-0 flex-col gap-4 rounded-lg border border-line bg-paper p-4 shadow-panel lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase text-teal">Red Dot Penguins</p>
          <h1 className="mt-1 break-words text-2xl font-semibold text-ink sm:text-3xl">
            Training Department
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:w-auto">
          <HeaderLink href="/admin" icon={ArrowLeft} label="Admin home" />
          <SignOutButton className="flex-1 sm:flex-none" />
        </div>
      </header>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={ShieldAlert} label="Needs attention" value={totals.attention} />
        <MetricCard icon={Award} label="Celebrate" value={totals.celebration} />
        <MetricCard icon={UserCheck} label="Host ready" value={totals.hostReady} />
        <MetricCard icon={GraduationCap} label="Trainees" value={totals.trainees} />
        <MetricCard icon={ClipboardCheck} label="Interview ready" value={totals.interviewReady} />
      </section>

      {message ? <StatusMessage tone={message.tone} message={message.text} /> : null}

      <section className="rounded-lg border border-line bg-paper p-4 shadow-panel">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-600">Search coaches</span>
            <span className="relative block">
              <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                className="h-10 w-full rounded-md border border-line bg-field pl-9 pr-3 text-sm outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Coach, centre, programme"
                value={search}
              />
            </span>
          </label>
          <SelectField
            label="Centre"
            onChange={setCentreFilter}
            options={centreOptions}
            value={centreFilter}
          />
          <SelectField
            label="View"
            onChange={(value) => setSignalFilter(value as SignalFilter)}
            options={[
              { label: "All coaches", value: "all" },
              { label: "Needs attention", value: "attention" },
              { label: "Celebrate", value: "celebrate" },
              { label: "Attachment hosts", value: "attachment" },
              { label: "Shadowing hosts", value: "shadowing" }
            ]}
            value={signalFilter}
          />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <HierarchyPanel coaches={visibleCoaches} />
        <CoachReadinessPanel coaches={visibleCoaches} />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <TraineeTrackerPanel
          coaches={trainingCoaches}
          onUpdateTrainee={updateTrainee}
          trainees={trainees}
        />
        <AttendancePanel
          attendanceForm={attendanceForm}
          coaches={trainingCoaches}
          onFormChange={(patch) => setAttendanceForm((current) => ({ ...current, ...patch }))}
          onSubmit={addAttendance}
          recentAttendance={recentAttendance}
          trainees={trainees}
        />
      </section>
    </main>
  );
}

function HierarchyPanel({ coaches }: { coaches: TrainingCoachProfile[] }) {
  return (
    <section className="rounded-lg border border-line bg-paper shadow-panel">
      <PanelHeader icon={Network} title="Coach hierarchy" subtitle={`${coaches.length} coaches shown`} />
      <div className="grid gap-3 p-4">
        {coaches.map((coach) => (
          <div
            className="rounded-lg border border-line bg-field p-3"
            key={coach.id}
            style={{ marginLeft: `${getHierarchyIndent(coach)}px` }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-ink">{coach.name}</p>
                <p className="text-sm text-slate-500">{coach.role}</p>
              </div>
              <SignalPill signal={getCoachSignal(coach)} />
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Reports to {getCoachName(coach.reportsToId) || "RBA"}
            </p>
            <div className="mt-2 flex flex-wrap gap-1">
              {coach.centres.map((centre) => (
                <MiniPill key={centre} label={centre} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CoachReadinessPanel({ coaches }: { coaches: TrainingCoachProfile[] }) {
  return (
    <section className="rounded-lg border border-line bg-paper shadow-panel">
      <PanelHeader icon={TrendingUp} title="Coach readiness" subtitle="Pass rate, feedback, and trainee suitability" />
      <div className="grid gap-3 p-4 lg:grid-cols-2">
        {coaches.map((coach) => {
          const total = coach.assessment.passCount + coach.assessment.failCount;
          const positive = coach.feedback.filter((item) => item.sentiment === "positive").length;
          const negative = coach.feedback.filter((item) => item.sentiment === "negative").length;

          return (
            <article className="rounded-lg border border-line bg-field p-4" key={coach.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-ink">{coach.name}</p>
                  <p className="text-sm text-slate-500">{coach.role}</p>
                </div>
                <SignalPill signal={getCoachSignal(coach)} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <MiniStat label="Pass rate" value={`${getCoachPassRate(coach)}%`} />
                <MiniStat label="Fail / total" value={`${coach.assessment.failCount}/${total}`} />
                <MiniStat label="Feedback" value={`+${positive} / -${negative}`} />
              </div>
              <p className="mt-3 text-sm font-semibold text-teal">{getCoachRecommendation(coach)}</p>
              <div className="mt-3 grid gap-2 text-sm text-slate-600">
                {coach.feedback.slice(0, 2).map((feedback) => (
                  <p className="rounded-md border border-line bg-paper px-3 py-2" key={feedback.id}>
                    <span className={feedback.sentiment === "positive" ? "text-emerald-700" : "text-amber-800"}>
                      {feedback.sentiment === "positive" ? "Positive" : "Watch"}:
                    </span>{" "}
                    {feedback.text}
                  </p>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function TraineeTrackerPanel({
  coaches,
  onUpdateTrainee,
  trainees
}: {
  coaches: TrainingCoachProfile[];
  onUpdateTrainee: (traineeId: string, patch: Partial<TrainingTrainee>) => void;
  trainees: TrainingTrainee[];
}) {
  return (
    <section className="rounded-lg border border-line bg-paper shadow-panel">
      <PanelHeader icon={BookOpenCheck} title="Attachment and shadowing" subtitle={`${attachmentRequiredHours}h attachment requirement`} />
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-10 bg-paper text-xs uppercase text-slate-500">
            <tr>
              {["Trainee", "Stage", "Hours", "Mentor", "Second interview", "Next"].map((heading) => (
                <th className="border-b border-line px-4 py-3 font-semibold" key={heading}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trainees.map((trainee) => {
              const hours = getTraineeCompletedHours(trainee);

              return (
                <tr className="align-top" key={trainee.id}>
                  <td className="border-b border-line px-4 py-3">
                    <p className="font-semibold text-ink">{trainee.name}</p>
                    <p className="text-slate-500">{trainee.centre} · {trainee.programme}</p>
                  </td>
                  <td className="border-b border-line px-4 py-3">
                    <select
                      className="h-9 rounded-md border border-line bg-field px-2 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
                      onChange={(event) => onUpdateTrainee(trainee.id, { stage: event.target.value as TraineeStage })}
                      value={trainee.stage}
                    >
                      {traineeStages.map((stage) => (
                        <option key={stage} value={stage}>{formatTraineeStage(stage)}</option>
                      ))}
                    </select>
                  </td>
                  <td className="border-b border-line px-4 py-3">
                    <p className="font-semibold text-ink">{hours}/{attachmentRequiredHours}h</p>
                    <ProgressBar value={getTraineeProgress(trainee)} />
                  </td>
                  <td className="border-b border-line px-4 py-3 text-slate-600">
                    {getCoachName(trainee.mentorCoachId, coaches)}
                  </td>
                  <td className="border-b border-line px-4 py-3">
                    <input
                      className="h-9 w-36 rounded-md border border-line bg-field px-2 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20"
                      onChange={(event) => onUpdateTrainee(trainee.id, { secondInterviewDate: event.target.value || null })}
                      type="date"
                      value={trainee.secondInterviewDate ?? ""}
                    />
                    <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                      <input
                        checked={trainee.secondInterviewPassed}
                        onChange={(event) => onUpdateTrainee(trainee.id, { secondInterviewPassed: event.target.checked })}
                        type="checkbox"
                      />
                      Passed
                    </label>
                  </td>
                  <td className="border-b border-line px-4 py-3 text-slate-600">{getTraineeNextStep(trainee)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AttendancePanel({
  attendanceForm,
  coaches,
  onFormChange,
  onSubmit,
  recentAttendance,
  trainees
}: {
  attendanceForm: {
    coachId: string;
    date: string;
    focus: string;
    hours: string;
    session: string;
    status: AttendanceStatus;
    traineeId: string;
  };
  coaches: TrainingCoachProfile[];
  onFormChange: (patch: Partial<typeof attendanceForm>) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  recentAttendance: Array<TrainingAttendanceEntry & { traineeName: string }>;
  trainees: TrainingTrainee[];
}) {
  return (
    <section className="rounded-lg border border-line bg-paper shadow-panel">
      <PanelHeader icon={CalendarPlus} title="Attendance log" subtitle="Attachment hours and missed sessions" />
      <form className="grid gap-3 border-b border-line p-4" onSubmit={onSubmit}>
        <SelectField
          label="Trainee"
          onChange={(value) => onFormChange({ traineeId: value })}
          options={trainees.map((trainee) => ({ label: trainee.name, value: trainee.id }))}
          value={attendanceForm.traineeId}
        />
        <SelectField
          label="Host coach"
          onChange={(value) => onFormChange({ coachId: value })}
          options={coaches.map((coach) => ({ label: coach.name, value: coach.id }))}
          value={attendanceForm.coachId}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Date" onChange={(value) => onFormChange({ date: value })} type="date" value={attendanceForm.date} />
          <TextField label="Hours" onChange={(value) => onFormChange({ hours: value })} type="number" value={attendanceForm.hours} />
        </div>
        <SelectField
          label="Session"
          onChange={(value) => onFormChange({ session: value })}
          options={sessionOptions.map((session) => ({ label: session, value: session }))}
          value={attendanceForm.session}
        />
        <SelectField
          label="Status"
          onChange={(value) => onFormChange({ status: value as AttendanceStatus })}
          options={attendanceStatuses.map((status) => ({ label: formatAttendanceStatus(status), value: status }))}
          value={attendanceForm.status}
        />
        <TextField label="Focus" onChange={(value) => onFormChange({ focus: value })} value={attendanceForm.focus} />
        <button
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal px-3 text-sm font-semibold text-white transition hover:bg-teal/90"
          type="submit"
        >
          <Save aria-hidden="true" className="size-4" />
          Log attendance
        </button>
      </form>
      <div className="grid gap-2 p-4">
        {recentAttendance.map((entry) => (
          <div className="rounded-lg border border-line bg-field p-3" key={entry.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-ink">{entry.traineeName}</p>
              <MiniPill label={formatAttendanceStatus(entry.status)} />
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {entry.date} · {entry.session} · {entry.hours}h with {getCoachName(entry.coachId, coaches)}
            </p>
            <p className="mt-1 text-sm text-slate-500">{entry.focus}</p>
          </div>
        ))}
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

function SignalPill({ signal }: { signal: CoachSignal }) {
  const classes = {
    attention: "border-orange-200 bg-orange-100 text-orange-900",
    celebrate: "border-emerald-200 bg-emerald-100 text-emerald-900",
    steady: "border-slate-200 bg-slate-100 text-slate-700"
  };
  const labels = {
    attention: "Needs attention",
    celebrate: "Celebrate",
    steady: "Steady"
  };

  return (
    <span className={clsx("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", classes[signal])}>
      {labels[signal]}
    </span>
  );
}

function MiniPill({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-full border border-line bg-paper px-2 py-0.5 text-xs font-semibold text-slate-600">
      {label}
    </span>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-paper px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 font-semibold text-ink">{value}</p>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="mt-2 h-2 rounded-full bg-line">
      <div className="h-2 rounded-full bg-teal" style={{ width: `${value}%` }} />
    </div>
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
  type?: "date" | "number" | "text";
  value: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      <input
        className="h-10 w-full rounded-md border border-line bg-field px-3 text-sm outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
        min={type === "number" ? "0" : undefined}
        onChange={(event) => onChange(event.target.value)}
        step={type === "number" ? "0.5" : undefined}
        type={type}
        value={value}
      />
    </label>
  );
}

function getCentreOptions(trainees: TrainingTrainee[]) {
  const centres = new Set<string>(["All"]);

  trainingCoaches.forEach((coach) => coach.centres.forEach((centre) => centres.add(centre)));
  trainees.forEach((trainee) => centres.add(trainee.centre));

  return Array.from(centres).filter(Boolean).sort((first, second) => {
    if (first === "All") return -1;
    if (second === "All") return 1;
    return first.localeCompare(second);
  });
}

function filterCoachBySignal(coach: TrainingCoachProfile, filter: SignalFilter) {
  if (filter === "all") return true;
  if (filter === "attachment") return coach.attachmentHost;
  if (filter === "shadowing") return coach.shadowingHost;

  return getCoachSignal(coach) === filter;
}

function getCoachName(coachId: string | null, coaches = trainingCoaches) {
  if (!coachId) return "";

  return coaches.find((coach) => coach.id === coachId)?.name ?? "";
}

function getHierarchyIndent(coach: TrainingCoachProfile) {
  return Math.max(0, roleOrder[coach.role] - 10);
}

function formatAttendanceStatus(status: AttendanceStatus) {
  switch (status) {
    case "attended":
      return "Attended";
    case "makeup_required":
      return "Make-up";
    case "absent":
      return "Absent";
  }
}

function createClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `training-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
