"use client";

import Link from "next/link";
import { ChangeEvent, DragEvent, useMemo, useState } from "react";
import { CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { parseUploadFile } from "@/lib/parseFile";
import {
  calculateDashboardMetrics,
  compareAssessmentQuarters,
  formatPercent
} from "@/lib/assessmentLogic";
import { recordsToAssessmentImportRows } from "@/lib/supabase/assessmentImport";
import { createClient } from "@/lib/supabase/client";
import type { StudentAssessmentRecord } from "@/types/assessment";

type UploadedDataset = {
  fileName: string;
  importedAt: string;
  records: StudentAssessmentRecord[];
};

export function FileUpload() {
  const [isParsing, setIsParsing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataset, setDataset] = useState<UploadedDataset | null>(null);

  const metrics = useMemo(
    () => (dataset ? calculateDashboardMetrics(dataset.records) : null),
    [dataset]
  );

  async function handleFile(file: File | undefined) {
    if (!file) {
      return;
    }

    setIsParsing(true);
    setError(null);

    try {
      const parsed = await parseUploadFile(file);
      const nextDataset: UploadedDataset = {
        fileName: parsed.fileName,
        importedAt: new Date().toISOString(),
        records: parsed.records
      };
      const importRows = recordsToAssessmentImportRows(parsed.records);
      const supabase = createClient();

      for (const [year, quarters] of getReplacementScope(importRows)) {
        const { error: deleteError } = await supabase
          .from("assessment_import_rows")
          .delete()
          .eq("year", Number(year))
          .in("quarter", Array.from(quarters));

        if (deleteError) {
          throw new Error(deleteError.message);
        }
      }

      const { error: insertError } = await supabase
        .from("assessment_import_rows")
        .insert(importRows);

      if (insertError) {
        throw new Error(insertError.message);
      }

      setDataset(nextDataset);
    } catch (uploadError) {
      setDataset(null);
      setError(uploadError instanceof Error ? uploadError.message : "Unable to parse the file.");
    } finally {
      setIsParsing(false);
    }
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFile(event.target.files?.[0]);
  }

  function onDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (!isParsing) {
      setIsDragging(true);
    }
  }

  function onDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    if (!isParsing) {
      void handleFile(event.dataTransfer.files?.[0]);
    }
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <div className="rounded-lg border border-line bg-paper p-5 shadow-panel">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-lg bg-teal/10 text-teal">
            <FileSpreadsheet aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 className="text-xl font-semibold text-ink">Upload assessment data</h2>
            <p className="text-sm text-slate-500">CSV, XLS, or XLSX</p>
          </div>
        </div>

        <label
          onDragOver={onDragOver}
          onDragEnter={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`mt-5 flex min-h-48 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-8 text-center transition ${
            isDragging
              ? "border-teal bg-teal/10"
              : "border-slate-300 bg-field hover:border-teal hover:bg-teal/5"
          }`}
        >
          <Upload aria-hidden="true" className="size-8 text-teal" />
          <span className="mt-3 text-sm font-semibold text-ink">
            {isParsing ? "Parsing file..." : "Drop file here or choose assessment file"}
          </span>
          <span className="mt-1 text-xs text-slate-500">CSV, XLS, or XLSX</span>
          <input
            type="file"
            accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={onInputChange}
            disabled={isParsing}
          />
        </label>

        {error ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <a
            href="/sample-lts-assessment-template.csv"
            download
            className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal"
          >
            <Download aria-hidden="true" className="size-4" />
            Sample template
          </a>
          <Link
            href="/admin"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-teal px-3 text-sm font-semibold text-white transition hover:bg-teal/90"
          >
            Admin home
          </Link>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-paper p-5 shadow-panel">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-lg bg-teal/10 text-teal">
            <CheckCircle2 aria-hidden="true" className="size-5" />
          </span>
          <div>
            <h2 className="text-xl font-semibold text-ink">Upload status</h2>
            <p className="text-sm text-slate-500">
              {dataset ? dataset.fileName : "Default dataset remains active"}
            </p>
          </div>
        </div>

        {dataset && metrics ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <StatusCard label="Rows imported" value={dataset.records.length.toLocaleString()} />
            <StatusCard
              label="Unique students"
              value={metrics.totalUniqueStudents.toLocaleString()}
            />
            {Object.entries(metrics.quarters)
              .sort(([first], [second]) =>
                compareAssessmentQuarters(first as `Q${number}`, second as `Q${number}`)
              )
              .map(([quarter, quarterMetrics]) => (
                <StatusCard
                  key={quarter}
                  label={`${quarter} pass rate`}
                  value={formatPercent(quarterMetrics?.passRate ?? 0)}
                />
              ))}
            <StatusCard label="Monitor" value={metrics.yellowFlagCount.toLocaleString()} />
            <StatusCard label="Immediate concern" value={metrics.redFlagCount.toLocaleString()} />
          </div>
        ) : (
          <div className="mt-5 rounded-lg border border-line bg-field p-4 text-sm text-slate-600">
            Uploaded rows will be saved into Supabase after you choose a file.
          </div>
        )}
      </div>
    </section>
  );
}

function getReplacementScope(
  rows: ReturnType<typeof recordsToAssessmentImportRows>
): Array<[string, Set<string>]> {
  const scope = new Map<string, Set<string>>();

  for (const row of rows) {
    const year = String(row.year);
    const quarters = scope.get(year) ?? new Set<string>();
    quarters.add(row.quarter);
    scope.set(year, quarters);
  }

  return Array.from(scope.entries());
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-field p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
    </div>
  );
}
