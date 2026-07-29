"use client";

import { RotateCcw, Search } from "lucide-react";
import type {
  AssessmentFilters,
  AssessmentQuarter,
  AssessmentResult,
  FilterOptions,
  FlagStatus
} from "@/types/assessment";

type FiltersProps = {
  filters: AssessmentFilters;
  options: FilterOptions;
  allowAllCentres: boolean;
  onChange: (filters: AssessmentFilters) => void;
  onReset: () => void;
};

function resultLabel(result: AssessmentResult | "All") {
  return result === "" ? "Blank" : result;
}

function concernLabel(flag: FlagStatus | "All") {
  if (flag === "All") {
    return "All concerns";
  }

  if (flag === "Red") {
    return "Immediate concern";
  }

  if (flag === "Yellow") {
    return "Monitor";
  }

  return "No immediate concern";
}

export function Filters({ filters, options, allowAllCentres, onChange, onReset }: FiltersProps) {
  function setFilter<Key extends keyof AssessmentFilters>(
    key: Key,
    value: AssessmentFilters[Key]
  ) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <section className="rounded-lg border border-line bg-paper p-4 shadow-panel">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="relative block">
          <span className="mb-1 block text-sm font-medium text-slate-600">Search student</span>
          <Search aria-hidden="true" className="absolute bottom-3 left-3 size-4 text-slate-400" />
          <input
            value={filters.search}
            onChange={(event) => setFilter("search", event.target.value)}
            className="h-10 w-full rounded-md border border-line bg-field pl-9 pr-3 text-sm outline-none transition focus:border-teal focus:bg-paper focus:ring-2 focus:ring-teal/15"
            placeholder="Student or coach name"
          />
        </label>

        <SelectField
          label="Coach"
          value={filters.coach}
          values={["All", ...options.coaches]}
          onChange={(value) => setFilter("coach", value)}
        />

        <SelectField
          label="Centre"
          value={filters.centre}
          values={allowAllCentres ? ["All", ...options.centres] : options.centres}
          labelForValue={(value) => (value === "All" ? "All centres" : value)}
          onChange={(value) => setFilter("centre", value)}
        />

        <SelectField
          label="Level"
          value={filters.level}
          values={["All", ...options.levels]}
          onChange={(value) => setFilter("level", value)}
        />

        <SelectField
          label="Concern"
          value={filters.flag}
          values={["All", "Red", "Yellow", "None"]}
          labelForValue={concernLabel}
          onChange={(value) => setFilter("flag", value as "All" | FlagStatus)}
        />

        <SelectField
          label="Session"
          value={filters.session}
          values={["All", ...options.sessions]}
          onChange={(value) => setFilter("session", value)}
        />

        <SelectField
          label="Quarter"
          value={filters.quarter}
          values={["All", ...options.quarters]}
          labelForValue={(value) => (value === "All" ? "All quarters" : value)}
          onChange={(value) => setFilter("quarter", value as "All" | AssessmentQuarter)}
        />

        <SelectField
          label="Result"
          value={filters.result}
          values={["All", ...options.results]}
          labelForValue={resultLabel}
          onChange={(value) => setFilter("result", value as "All" | AssessmentResult)}
        />

        <div className="flex items-end">
          <button
            type="button"
            onClick={onReset}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-medium text-slate-700 transition hover:border-teal hover:text-teal"
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            Reset filters
          </button>
        </div>
      </div>
    </section>
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
