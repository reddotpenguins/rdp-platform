import clsx from "clsx";
import { formatPercent } from "@/lib/assessmentLogic";
import type { QuarterSummary } from "@/types/assessment";

type QuarterSummaryTableProps = {
  summaries: QuarterSummary[];
};

export function QuarterSummaryTable({ summaries }: QuarterSummaryTableProps) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-line bg-paper shadow-panel">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-lg font-semibold text-ink">Quarter and session summary</h2>
        <p className="text-sm text-slate-500">
          {summaries.length.toLocaleString()} quarter/session groups
        </p>
      </div>

      <div className="w-full overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-paper text-xs uppercase text-slate-500">
            <tr>
              {[
                "Quarter",
                "Session",
                "Centre",
                "Coach",
                "Total students",
                "Assessed",
                "Pass",
                "Fail",
                "Pass rate",
                "Monitor",
                "Immediate concern",
                "Suggested action"
              ].map((heading) => (
                <th key={heading} className="border-b border-line px-4 py-3 font-semibold">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summaries.map((summary) => (
              <tr key={summary.id} className="align-top transition hover:bg-teal/5">
                <td className="border-b border-line px-4 py-3 font-medium text-ink">
                  {summary.quarter}
                </td>
                <td className="border-b border-line px-4 py-3">{summary.session}</td>
                <td className="border-b border-line px-4 py-3">{summary.centre}</td>
                <td className="border-b border-line px-4 py-3">{summary.coachName}</td>
                <td className="border-b border-line px-4 py-3">{summary.totalStudents}</td>
                <td className="border-b border-line px-4 py-3">{summary.assessedCount}</td>
                <td className="border-b border-line px-4 py-3">{summary.passCount}</td>
                <td className="border-b border-line px-4 py-3">{summary.failCount}</td>
                <td className="border-b border-line px-4 py-3">
                  {formatPercent(summary.passRate)}
                </td>
                <td className="border-b border-line px-4 py-3 text-yellow-800">
                  {summary.yellowFlagCount}
                </td>
                <td className="border-b border-line px-4 py-3 text-red-700">
                  {summary.redFlagCount}
                </td>
                <td className="border-b border-line px-4 py-3">
                  <span
                    className={clsx(
                      "inline-flex rounded-md border px-2 py-1 text-xs font-semibold",
                      summary.suggestedAction === "Intervention Review" &&
                        "border-red-300 bg-red-50 text-red-700",
                      summary.suggestedAction === "Monitor" &&
                        "border-amber/40 bg-amber/10 text-yellow-800",
                      summary.suggestedAction === "No immediate concern" &&
                        "border-slate-200 bg-paper text-slate-600"
                    )}
                  >
                    {summary.suggestedAction}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
