import clsx from "clsx";
import { formatPercent } from "@/lib/assessmentLogic";
import type { AssessmentQuarter, CoachSummary, QuarterMetrics } from "@/types/assessment";

type CoachSummaryTableProps = {
  summaries: CoachSummary[];
  selectedQuarter: "All" | AssessmentQuarter;
};

type CoachDisplayMetrics = QuarterMetrics & {
  failRate: number;
};

export function CoachSummaryTable({ summaries, selectedQuarter }: CoachSummaryTableProps) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-line bg-paper shadow-panel">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-lg font-semibold text-ink">Coach summary</h2>
        <p className="text-sm text-slate-500">
          {summaries.length.toLocaleString()} coaches in current filter
        </p>
      </div>

      <div className="max-h-[520px] w-full overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-10 bg-paper text-xs uppercase text-slate-500">
            <tr>
              {[
                "Coach name",
                "Students",
                "Assessed",
                "Pass",
                "Fail / total",
                "Fail %",
                "Pass rate",
                "Monitor",
                "Require intervention",
                "Status"
              ].map((heading) => (
                <th key={heading} className="border-b border-line px-4 py-3 font-semibold">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summaries.map((summary) => {
              const metrics = getDisplayMetrics(summary, selectedQuarter);
              const status = coachStatusLabel(summary);

              return (
                <tr key={summary.coachName} className="align-top transition hover:bg-teal/5">
                  <td className="border-b border-line px-4 py-3 font-medium text-ink">
                    {summary.coachName}
                  </td>
                  <td className="border-b border-line px-4 py-3">{summary.totalStudents}</td>
                  <td className="border-b border-line px-4 py-3">{metrics.assessedCount}</td>
                  <td className="border-b border-line px-4 py-3 font-semibold text-green-700">
                    {metrics.passCount}
                  </td>
                  <td className="border-b border-line px-4 py-3 font-semibold text-red-700">
                    {metrics.failCount} / {metrics.totalCount}
                  </td>
                  <td className="border-b border-line px-4 py-3 font-semibold text-red-700">
                    {formatPercent(metrics.failRate)}
                  </td>
                  <td className="border-b border-line px-4 py-3">
                    {formatPercent(metrics.passRate)}
                  </td>
                  <td className="border-b border-line px-4 py-3 font-semibold text-yellow-800">
                    {summary.yellowFlagCount}
                  </td>
                  <td className="border-b border-line px-4 py-3 font-semibold text-orange-700">
                    {summary.redFlagCount}
                  </td>
                  <td className="border-b border-line px-4 py-3">
                    <span
                      className={clsx(
                        "inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-xs font-semibold",
                        status === "Require intervention" &&
                          "border-orange-300 bg-orange-100 text-orange-800",
                        status === "Monitor" &&
                          "border-yellow-300 bg-yellow-100 text-yellow-800",
                        status === "On track" && "border-sky-200 bg-sky-50 text-sky-800"
                      )}
                    >
                      {status}
                    </span>
                  </td>
                </tr>
              );
            })}
            {summaries.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="border-b border-line px-4 py-8 text-center text-sm text-slate-500"
                >
                  No coaches match the current filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function getDisplayMetrics(
  summary: CoachSummary,
  selectedQuarter: "All" | AssessmentQuarter
): CoachDisplayMetrics {
  if (selectedQuarter !== "All") {
    return (
      summary.quarters[selectedQuarter] ?? {
        assessedCount: 0,
        failCount: 0,
        failRate: 0,
        passCount: 0,
        passRate: 0,
        totalCount: 0
      }
    );
  }

  const metrics = Object.values(summary.quarters).reduce(
    (total, quarterMetrics) => ({
      assessedCount: total.assessedCount + (quarterMetrics?.assessedCount ?? 0),
      failCount: total.failCount + (quarterMetrics?.failCount ?? 0),
      passCount: total.passCount + (quarterMetrics?.passCount ?? 0),
      totalCount: total.totalCount + (quarterMetrics?.totalCount ?? 0)
    }),
    {
      assessedCount: 0,
      failCount: 0,
      passCount: 0,
      totalCount: 0
    }
  );

  return {
    ...metrics,
    failRate: metrics.totalCount > 0 ? metrics.failCount / metrics.totalCount : 0,
    passRate: metrics.assessedCount > 0 ? metrics.passCount / metrics.assessedCount : 0
  };
}

function coachStatusLabel(summary: CoachSummary) {
  if (summary.redFlagCount > 0) {
    return "Require intervention";
  }

  if (summary.yellowFlagCount > 0) {
    return "Monitor";
  }

  return "On track";
}
