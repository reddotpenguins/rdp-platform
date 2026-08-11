"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  FileText,
  GraduationCap,
  Library,
  Plus,
  Save,
  Search,
  Trash2,
  Video,
  type LucideIcon
} from "lucide-react";
import clsx from "clsx";
import {
  deleteTrainingResourceAction,
  saveTrainingResourceAction
} from "@/app/training/resources/actions";
import { SignOutButton } from "@/components/SignOutButton";
import type { StaffProfile } from "@/lib/staffRoles";
import {
  getTrainingResourceVideoEmbedUrl,
  splitTrainingResourceText,
  trainingResourceProgrammes,
  trainingResourceStatuses,
  type TrainingResource
} from "@/lib/trainingResources";

type TrainingResourcesClientProps = {
  canManage: boolean;
  dataError?: string;
  flash: {
    text: string;
    tone: "error" | "success";
  } | null;
  resources: TrainingResource[];
  staffProfile: StaffProfile;
};

type ResourceFilters = {
  level: string;
  programme: string;
  query: string;
  skillType: string;
};

const emptyFilters: ResourceFilters = {
  level: "All",
  programme: "All",
  query: "",
  skillType: "All"
};

export function TrainingResourcesClient({
  canManage,
  dataError,
  flash,
  resources,
  staffProfile
}: TrainingResourcesClientProps) {
  const [filters, setFilters] = useState<ResourceFilters>(emptyFilters);
  const [formMode, setFormMode] = useState<"selected" | "new">("selected");
  const [selectedResourceId, setSelectedResourceId] = useState(resources[0]?.id ?? "");
  const visibleResources = useMemo(
    () => resources.filter((resource) => resourceMatchesFilters(resource, filters)),
    [filters, resources]
  );
  const selectedResource = useMemo(
    () =>
      resources.find((resource) => resource.id === selectedResourceId) ??
      visibleResources[0] ??
      resources[0] ??
      null,
    [resources, selectedResourceId, visibleResources]
  );
  const levels = useMemo(() => getUniqueOptions(resources.map((resource) => resource.levelLabel)), [resources]);
  const skillTypes = useMemo(() => getUniqueOptions(resources.map((resource) => resource.skillType)), [resources]);
  const publishedCount = resources.filter((resource) => resource.status === "published").length;

  function selectResource(resourceId: string) {
    setSelectedResourceId(resourceId);
    setFormMode("selected");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex min-w-0 flex-col gap-4 rounded-lg border border-line bg-paper p-4 shadow-panel lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase text-teal">Red Dot Penguins</p>
          <h1 className="mt-1 break-words text-2xl font-semibold text-ink sm:text-3xl">
            Training Resources
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {staffProfile.fullName} · {formatRoleLabel(staffProfile.role)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <HeaderLink href={canManage ? "/admin" : "/dashboard"} icon={ArrowLeft} label={canManage ? "Admin home" : "Dashboard"} />
          <SignOutButton className="flex-1 sm:flex-none" />
        </div>
      </header>

      {dataError ? <StatusMessage message={dataError} tone="error" /> : null}
      {flash ? <StatusMessage message={flash.text} tone={flash.tone} /> : null}

      <section className="grid gap-3 md:grid-cols-3">
        <MetricCard icon={Library} label="Resources" value={resources.length} />
        <MetricCard icon={Video} label="Published" value={publishedCount} />
        <MetricCard icon={GraduationCap} label="Programmes" value={trainingResourceProgrammes.length} />
      </section>

      <section className="rounded-lg border border-line bg-paper p-3 shadow-panel sm:p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(240px,1.2fr)_repeat(3,minmax(150px,0.8fr))]">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-600">Search</span>
            <span className="flex h-10 items-center gap-2 rounded-md border border-line bg-field px-3">
              <Search aria-hidden="true" className="size-4 text-slate-400" />
              <input
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
                placeholder="Skill, cue, mistake"
                value={filters.query}
              />
            </span>
          </label>
          <SelectField
            label="Programme"
            onChange={(programme) => setFilters((current) => ({ ...current, programme }))}
            options={["All", ...trainingResourceProgrammes]}
            value={filters.programme}
          />
          <SelectField
            label="Level"
            onChange={(level) => setFilters((current) => ({ ...current, level }))}
            options={["All", ...levels]}
            value={filters.level}
          />
          <SelectField
            label="Skill type"
            onChange={(skillType) => setFilters((current) => ({ ...current, skillType }))}
            options={["All", ...skillTypes]}
            value={filters.skillType}
          />
        </div>
      </section>

      <section className="grid min-w-0 gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
        <ResourceList
          onSelect={selectResource}
          resources={visibleResources}
          selectedResourceId={selectedResource?.id ?? ""}
        />
        <div className="flex min-w-0 flex-col gap-5">
          <ResourceDetail resource={selectedResource} />
          {canManage ? (
            <ResourceEditor
              key={formMode === "new" ? "new-resource" : selectedResource?.id ?? "new-resource"}
              mode={formMode}
              onNew={() => setFormMode("new")}
              resource={formMode === "new" ? null : selectedResource}
            />
          ) : null}
        </div>
      </section>
    </main>
  );
}

function ResourceList({
  onSelect,
  resources,
  selectedResourceId
}: {
  onSelect: (resourceId: string) => void;
  resources: TrainingResource[];
  selectedResourceId: string;
}) {
  return (
    <section className="rounded-lg border border-line bg-paper shadow-panel">
      <PanelHeader icon={BookOpen} title="Resource Library" subtitle={`${resources.length} shown`} />
      <div className="max-h-[720px] overflow-y-auto p-3">
        {resources.length > 0 ? (
          <div className="grid gap-2">
            {resources.map((resource) => (
              <button
                className={clsx(
                  "rounded-md border p-3 text-left transition hover:border-teal hover:bg-teal/5",
                  selectedResourceId === resource.id ? "border-teal bg-teal/10" : "border-line bg-field"
                )}
                key={resource.id}
                onClick={() => onSelect(resource.id)}
                type="button"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block break-words text-sm font-semibold text-ink">{resource.title}</span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {resource.programme}{resource.levelLabel ? ` · ${resource.levelLabel}` : ""}
                    </span>
                  </span>
                  <StatusPill status={resource.status} />
                </div>
                {resource.skillType ? <span className="mt-2 inline-flex rounded-full bg-paper px-2 py-1 text-xs font-semibold text-teal">{resource.skillType}</span> : null}
              </button>
            ))}
          </div>
        ) : (
          <EmptyState text="No training resources match the current filters." />
        )}
      </div>
    </section>
  );
}

function ResourceDetail({ resource }: { resource: TrainingResource | null }) {
  if (!resource) {
    return (
      <section className="rounded-lg border border-line bg-paper shadow-panel">
        <PanelHeader icon={Video} title="Skill Detail" subtitle="No resource selected" />
        <div className="p-4">
          <EmptyState text="Add a training resource to start building the library." />
        </div>
      </section>
    );
  }

  const embedUrl = getTrainingResourceVideoEmbedUrl(resource.videoUrl);

  return (
    <section className="overflow-hidden rounded-lg border border-line bg-paper shadow-panel">
      <div className="border-b border-line p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase text-teal">{resource.programme}</p>
            <h2 className="mt-1 break-words text-2xl font-semibold text-ink">{resource.title}</h2>
            <p className="mt-2 text-sm text-slate-500">
              {[resource.levelLabel, resource.skillType].filter(Boolean).join(" · ") || "General skill"}
            </p>
          </div>
          <StatusPill status={resource.status} />
        </div>
      </div>

      <div className="grid gap-5 p-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
        <div className="min-w-0">
          {embedUrl ? (
            <iframe
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              className="aspect-video w-full rounded-lg border border-line bg-ink"
              src={embedUrl}
              title={resource.title}
            />
          ) : (
            <div className="flex aspect-video flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line bg-field p-4 text-center">
              <Video aria-hidden="true" className="size-8 text-teal" />
              <p className="text-sm font-medium text-slate-600">No embeddable video available.</p>
              {resource.videoUrl ? (
                <a
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-teal px-3 text-sm font-semibold text-white transition hover:bg-coral"
                  href={resource.videoUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  <ExternalLink aria-hidden="true" className="size-4" />
                  Open video
                </a>
              ) : null}
            </div>
          )}
          {resource.description ? <p className="mt-4 whitespace-pre-line text-sm leading-6 text-slate-700">{resource.description}</p> : null}
        </div>

        <div className="grid gap-3">
          <DetailSection icon={CheckCircle2} title="Teaching cues" value={resource.teachingCues} />
          <DetailSection icon={FileText} title="Common mistakes" value={resource.commonMistakes} />
          <DetailSection icon={GraduationCap} title="Assessment criteria" value={resource.assessmentCriteria} />
        </div>
      </div>
    </section>
  );
}

function DetailSection({
  icon: Icon,
  title,
  value
}: {
  icon: LucideIcon;
  title: string;
  value: string | null;
}) {
  const lines = splitTrainingResourceText(value);

  return (
    <section className="rounded-lg border border-line bg-field p-3">
      <div className="flex items-center gap-2">
        <Icon aria-hidden="true" className="size-4 text-teal" />
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
      </div>
      {lines.length > 0 ? (
        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
          {lines.map((line) => (
            <li className="rounded-md bg-paper px-3 py-2" key={line}>{line}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-500">Not added yet.</p>
      )}
    </section>
  );
}

function ResourceEditor({
  mode,
  onNew,
  resource
}: {
  mode: "selected" | "new";
  onNew: () => void;
  resource: TrainingResource | null;
}) {
  return (
    <section className="rounded-lg border border-line bg-paper shadow-panel">
      <PanelHeader
        icon={Plus}
        title={mode === "new" ? "Add Resource" : "Manage Resource"}
        subtitle={mode === "new" ? "New training skill" : resource?.title ?? "No resource selected"}
      />
      <form action={saveTrainingResourceAction} className="grid gap-3 p-4">
        <input name="resourceId" type="hidden" value={resource?.id ?? ""} />
        <div className="grid gap-3 lg:grid-cols-2">
          <TextField defaultValue={resource?.title ?? ""} label="Skill name" name="title" required />
          <SelectField
            label="Programme"
            name="programme"
            options={[...trainingResourceProgrammes]}
            value={resource?.programme ?? "Learn to Swim"}
          />
          <TextField defaultValue={resource?.levelLabel ?? ""} label="Level / stage" name="levelLabel" />
          <TextField defaultValue={resource?.skillType ?? ""} label="Skill type" name="skillType" />
        </div>
        <TextField defaultValue={resource?.videoUrl ?? ""} label="Video URL" name="videoUrl" />
        <TextAreaField defaultValue={resource?.description ?? ""} label="Description" name="description" />
        <div className="grid gap-3 lg:grid-cols-3">
          <TextAreaField defaultValue={resource?.teachingCues ?? ""} label="Teaching cues" name="teachingCues" />
          <TextAreaField defaultValue={resource?.commonMistakes ?? ""} label="Common mistakes" name="commonMistakes" />
          <TextAreaField defaultValue={resource?.assessmentCriteria ?? ""} label="Assessment criteria" name="assessmentCriteria" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Status"
            name="status"
            options={[...trainingResourceStatuses]}
            value={resource?.status ?? "published"}
          />
          <TextField defaultValue={String(resource?.sortOrder ?? 100)} label="Sort order" min="1" name="sortOrder" type="number" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-teal px-3 text-sm font-semibold text-white transition hover:bg-coral sm:flex-none"
            type="submit"
          >
            <Save aria-hidden="true" className="size-4" />
            Save resource
          </button>
          <button
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-line bg-field px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal sm:flex-none"
            onClick={onNew}
            type="button"
          >
            <Plus aria-hidden="true" className="size-4" />
            New resource
          </button>
        </div>
      </form>
      {resource ? (
        <form action={deleteTrainingResourceAction} className="border-t border-line p-4">
          <input name="resourceId" type="hidden" value={resource.id} />
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-700 transition hover:border-rose-400 hover:bg-rose-100"
            onClick={(event) => {
              if (!window.confirm("Delete this training resource?")) {
                event.preventDefault();
              }
            }}
            type="submit"
          >
            <Trash2 aria-hidden="true" className="size-4" />
            Delete resource
          </button>
        </form>
      ) : null}
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

function StatusPill({ status }: { status: TrainingResource["status"] }) {
  return (
    <span
      className={clsx(
        "shrink-0 rounded-full px-2 py-1 text-xs font-semibold capitalize",
        status === "published" && "bg-emerald-50 text-emerald-700",
        status === "draft" && "bg-amber-50 text-amber-700",
        status === "archived" && "bg-slate-100 text-slate-500"
      )}
    >
      {status}
    </span>
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
    <div className="rounded-lg border border-dashed border-line bg-field px-4 py-8 text-center text-sm text-slate-500">
      {text}
    </div>
  );
}

function SelectField({
  label,
  name,
  onChange,
  options,
  value
}: {
  label: string;
  name?: string;
  onChange?: (value: string) => void;
  options: string[];
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
        {options.map((option) => (
          <option key={option} value={option}>
            {formatOptionLabel(option)}
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
  type?: "number" | "text";
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
        className="min-h-28 w-full resize-y rounded-md border border-line bg-field px-3 py-2 text-sm outline-none transition focus:border-teal focus:ring-2 focus:ring-teal/20"
        defaultValue={defaultValue}
        name={name}
      />
    </label>
  );
}

function resourceMatchesFilters(resource: TrainingResource, filters: ResourceFilters) {
  const query = filters.query.trim().toLowerCase();

  if (filters.programme !== "All" && resource.programme !== filters.programme) {
    return false;
  }

  if (filters.level !== "All" && resource.levelLabel !== filters.level) {
    return false;
  }

  if (filters.skillType !== "All" && resource.skillType !== filters.skillType) {
    return false;
  }

  if (!query) {
    return true;
  }

  return [
    resource.title,
    resource.programme,
    resource.levelLabel,
    resource.skillType,
    resource.description,
    resource.teachingCues,
    resource.commonMistakes,
    resource.assessmentCriteria
  ]
    .filter(Boolean)
    .some((value) => value?.toLowerCase().includes(query));
}

function getUniqueOptions(values: Array<string | null>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b));
}

function formatRoleLabel(role: StaffProfile["role"]) {
  if (role === "lead_coach") {
    return "Lead coach";
  }

  return role.charAt(0).toUpperCase() + role.slice(1);
}

function formatOptionLabel(option: string) {
  if (option === "lead_coach") {
    return "Lead coach";
  }

  return option.charAt(0).toUpperCase() + option.slice(1).replaceAll("_", " ");
}
