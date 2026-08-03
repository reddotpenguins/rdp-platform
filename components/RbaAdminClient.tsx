"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useFormStatus } from "react-dom";
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  CircleOff,
  Save,
  ShieldCheck,
  UserPlus,
  Users,
  type LucideIcon
} from "lucide-react";
import { createStaffProfileAction, updateStaffProfileAction } from "@/app/rba/actions";
import { SignOutButton } from "@/components/SignOutButton";
import { formatStaffRole, staffRoles, type StaffManagementProfile } from "@/lib/staffRoles";

type RbaAdminClientProps = {
  currentStaffId: string;
  profiles: StaffManagementProfile[];
  savedMessage?: string;
  errorMessage?: string;
  dataError?: string;
};

export function RbaAdminClient({
  currentStaffId,
  profiles,
  savedMessage,
  errorMessage,
  dataError
}: RbaAdminClientProps) {
  const totals = useMemo(
    () => ({
      active: profiles.filter((profile) => profile.active).length,
      admins: profiles.filter((profile) => profile.role === "admin").length,
      coaches: profiles.filter((profile) => profile.role === "coach").length,
      leadCoaches: profiles.filter((profile) => profile.role === "lead_coach").length
    }),
    [profiles]
  );

  return (
    <main className="mx-auto flex min-w-0 w-full max-w-[1500px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex min-w-0 flex-col gap-4 rounded-lg border border-line bg-paper p-4 shadow-panel lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase text-teal">Red Dot Penguins</p>
          <h1 className="mt-1 break-words text-2xl font-semibold text-ink sm:text-3xl">
            RBA Staff Access
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
        <MetricCard icon={Users} label="Staff profiles" value={profiles.length} />
        <MetricCard icon={ShieldCheck} label="Admins" value={totals.admins} />
        <MetricCard icon={BadgeCheck} label="Lead coaches" value={totals.leadCoaches} />
        <MetricCard icon={CheckCircle2} label="Active users" value={totals.active} />
      </section>

      {savedMessage ? (
        <StatusMessage tone="success" message={savedMessage} />
      ) : errorMessage ? (
        <StatusMessage tone="error" message={errorMessage} />
      ) : dataError ? (
        <StatusMessage tone="error" message={dataError} />
      ) : null}

      <section className="rounded-lg border border-line bg-paper p-4 shadow-panel">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-teal/10 text-teal">
            <UserPlus aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-ink">Add invited staff profile</h2>
            <p className="text-sm text-slate-500">
              Use the same email that was invited in Supabase Auth.
            </p>
          </div>
        </div>

        <form action={createStaffProfileAction} className="mt-4 grid gap-3 lg:grid-cols-6">
          <TextField label="Email" name="email" type="email" required />
          <TextField label="Full name" name="fullName" required />
          <RoleField label="Role" name="role" defaultValue="coach" />
          <TextField label="Coach name" name="coachName" />
          <CentresField
            label="Lead coach centres"
            name="assignedCentres"
            placeholder="SJII, ACSBR"
          />
          <div className="flex items-end gap-3">
            <ActiveField defaultChecked />
            <SubmitButton label="Add" icon="add" />
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-line bg-paper shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Manage staff roles</h2>
            <p className="text-sm text-slate-500">
              Lead coach centres can be separated by commas or new lines.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-md border border-line bg-field px-3 py-2 text-sm font-semibold text-slate-700">
            <CircleOff aria-hidden="true" className="size-4 text-slate-400" />
            {totals.coaches} coaches
          </span>
        </div>

        <div className="max-h-[640px] overflow-auto">
          <table className="min-w-[1180px] w-full border-collapse text-left text-sm">
            <thead className="sticky top-0 z-10 bg-field text-xs uppercase text-slate-500 shadow-[0_1px_0_#ffd6b3]">
              <tr>
                <th className="px-4 py-3 font-semibold">Staff</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Coach name</th>
                <th className="px-4 py-3 font-semibold">Lead coach centres</th>
                <th className="px-4 py-3 font-semibold">Active</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <StaffProfileRow
                  currentStaffId={currentStaffId}
                  key={profile.id}
                  profile={profile}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function StaffProfileRow({
  currentStaffId,
  profile
}: {
  currentStaffId: string;
  profile: StaffManagementProfile;
}) {
  const isCurrentAdmin = currentStaffId === profile.id;

  return (
    <tr className="align-top odd:bg-paper even:bg-field/50">
      <td className="border-b border-line px-4 py-3">
        <input type="hidden" name="staffProfileId" value={profile.id} form={`profile-${profile.id}`} />
        <div className="font-semibold text-ink">{profile.fullName}</div>
        <div className="mt-1 text-xs text-slate-500">{profile.email}</div>
        {isCurrentAdmin ? (
          <div className="mt-2 inline-flex rounded-md bg-teal/10 px-2 py-1 text-xs font-semibold text-teal">
            Current admin
          </div>
        ) : null}
      </td>
      <td className="border-b border-line px-4 py-3">
        <form id={`profile-${profile.id}`} action={updateStaffProfileAction} />
        <TextField
          label="Full name"
          name="fullName"
          defaultValue={profile.fullName}
          required
          compact
          form={`profile-${profile.id}`}
        />
        <div className="mt-3">
          <RoleField
            label="Role"
            name="role"
            defaultValue={profile.role}
            disabled={isCurrentAdmin}
            form={`profile-${profile.id}`}
          />
          {isCurrentAdmin ? (
            <input type="hidden" name="role" value="admin" form={`profile-${profile.id}`} />
          ) : null}
        </div>
      </td>
      <td className="border-b border-line px-4 py-3">
        <TextField
          label="Coach display name"
          name="coachName"
          defaultValue={profile.coachName ?? ""}
          compact
          form={`profile-${profile.id}`}
        />
      </td>
      <td className="border-b border-line px-4 py-3">
        <CentresField
          label="Centres"
          name="assignedCentres"
          defaultValue={profile.assignedCentres.join(", ")}
          form={`profile-${profile.id}`}
        />
      </td>
      <td className="border-b border-line px-4 py-3">
        <ActiveField
          defaultChecked={profile.active}
          disabled={isCurrentAdmin}
          form={`profile-${profile.id}`}
        />
        {isCurrentAdmin ? (
          <input type="hidden" name="active" value="true" form={`profile-${profile.id}`} />
        ) : null}
      </td>
      <td className="border-b border-line px-4 py-3">
        <SubmitButton label="Save" icon="save" form={`profile-${profile.id}`} />
      </td>
    </tr>
  );
}

function TextField({
  label,
  name,
  defaultValue = "",
  form,
  type = "text",
  required = false,
  compact = false
}: {
  label: string;
  name: string;
  defaultValue?: string;
  form?: string;
  type?: string;
  required?: boolean;
  compact?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      <input
        className="h-10 w-full rounded-md border border-line bg-field px-3 text-sm outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
        defaultValue={defaultValue}
        form={form}
        name={name}
        required={required}
        type={type}
      />
      {compact ? null : <span className="sr-only">{label}</span>}
    </label>
  );
}

function RoleField({
  label,
  name,
  defaultValue,
  disabled = false,
  form
}: {
  label: string;
  name: string;
  defaultValue: string;
  disabled?: boolean;
  form?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      <select
        className="h-10 w-full rounded-md border border-line bg-field px-3 text-sm outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
        defaultValue={defaultValue}
        disabled={disabled}
        form={form}
        name={name}
      >
        {staffRoles.map((role) => (
          <option key={role} value={role}>
            {formatStaffRole(role)}
          </option>
        ))}
      </select>
    </label>
  );
}

function CentresField({
  label,
  name,
  defaultValue = "",
  form,
  placeholder
}: {
  label: string;
  name: string;
  defaultValue?: string;
  form?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-600">{label}</span>
      <textarea
        className="min-h-10 w-full rounded-md border border-line bg-field px-3 py-2 text-sm outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
        defaultValue={defaultValue}
        form={form}
        name={name}
        placeholder={placeholder}
        rows={2}
      />
    </label>
  );
}

function ActiveField({
  defaultChecked,
  disabled = false,
  form
}: {
  defaultChecked: boolean;
  disabled?: boolean;
  form?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
      {disabled ? null : <input type="hidden" name="active" value="false" form={form} />}
      <input
        className="size-4 rounded border-line text-teal focus:ring-teal"
        defaultChecked={defaultChecked}
        disabled={disabled}
        form={form}
        name="active"
        type="checkbox"
        value="true"
      />
      Active
    </label>
  );
}

function SubmitButton({
  label,
  icon,
  form
}: {
  label: string;
  icon: "add" | "save";
  form?: string;
}) {
  const { pending } = useFormStatus();
  const Icon = icon === "add" ? UserPlus : Save;

  return (
    <button
      type="submit"
      form={form}
      disabled={pending}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal px-3 text-sm font-semibold text-white transition hover:bg-teal/90 disabled:cursor-wait disabled:opacity-70"
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
