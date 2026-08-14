import clsx from "clsx";
import type { AssessmentQuarter, CoachSummary } from "@/types/assessment";
import {
  assessmentQuarters,
  compareAssessmentQuarters,
  formatPercent
} from "@/lib/assessmentLogic";

type CoachSummaryTableProps = {
  summaries: CoachSummary[];
  selectedQuarter: "All" | AssessmentQuarter;
};

export function CoachSummaryTable({ summaries, selectedQuarter }: CoachSummaryTableProps) {
  const displayedQuarters = getDisplayedSummaryQuarters(summaries, selectedQuarter);

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-line bg-paper shadow-panel">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-lg font-semibold text-ink">Coach summary</h2>
        <p className="text-sm text-slate-500">{summaries.length.toLocaleString()} coaches</p>
      </div>

      <div className="max-h-[620px] w-full overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="sticky top-0 z-10 bg-paper text-xs uppercase text-slate-500">
            <tr>
              {[
                "Coach name",
                "Total students",
                ...displayedQuarters.flatMap((quarter) => [
                  `${quarter} total`,
                  `${quarter} assessed`,
                  `${quarter} pass`,
                  `${quarter} fail / total`,
                  `${quarter} fail %`,
                  `${quarter} pass rate`
                ]),
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
              <tr key={summary.coachName} className="align-top transition hover:bg-teal/5">
                <td className="border-b border-line px-4 py-3 font-medium text-ink">
                  {summary.coachName}
                </td>
                <td className="border-b border-line px-4 py-3">{summary.totalStudents}</td>
                {displayedQuarters.map((quarter) => {
                  const metrics = getQuarterMetrics(summary, quarter);

                  return (
                    <QuarterMetricsCells
                      key={`${summary.coachName}-${quarter}`}
                      metrics={metrics}
                      quarter={quarter}
                    />
                  );
                })}
                <td className="border-b border-line px-4 py-3 font-semibold text-yellow-800">
                  {summary.yellowFlagCount}
                </td>
                <td className="border-b border-line px-4 py-3 font-semibold text-orange-700">
                  {summary.redFlagCount}
                </td>
                <td className="border-b border-line px-4 py-3">
                  <span
                    className={clsx(
                      "inline-flex rounded-md border px-2 py-1 text-xs font-semibold",
                      summary.suggestedAction === "Intervention Review" &&
                        "border-orange-300 bg-orange-100 text-orange-700",
                      summary.suggestedAction === "Monitor" &&
                        "border-yellow-300 bg-yellow-100 text-yellow-800",
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

function QuarterMetricsCells({
  metrics,
  quarter
}: {
  metrics: NonNullable<CoachSummary["quarters"][AssessmentQuarter]>;
  quarter: AssessmentQuarter;
}) {
  return (
    <>
      <td className="border-b border-line px-4 py-3">{metrics.totalCount}</td>
      <td className="border-b border-line px-4 py-3">{metrics.assessedCount}</td>
      <td className={clsx("border-b border-line px-4 py-3 font-semibold", getPassTextClass(quarter))}>
        {metrics.passCount}
      </td>
      <td className={clsx("border-b border-line px-4 py-3 font-semibold", getFailTextClass(quarter))}>
        {metrics.failCount} / {metrics.totalCount}
      </td>
      <td className={clsx("border-b border-line px-4 py-3 font-semibold", getFailTextClass(quarter))}>
        {formatPercent(metrics.failRate)}
      </td>
      <td className="border-b border-line px-4 py-3">{formatPercent(metrics.passRate)}</td>
    </>
  );
}

function getDisplayedSummaryQuarters(
  summaries: CoachSummary[],
  selectedQuarter: "All" | AssessmentQuarter
) {
  if (selectedQuarter !== "All") {
    return [selectedQuarter];
  }

  const quarters = new Set<AssessmentQuarter>();

  summaries.forEach((summary) => {
    Object.keys(summary.quarters).forEach((quarter) => {
      quarters.add(quarter as AssessmentQuarter);
    });
  });

  const displayedQuarters = Array.from(quarters).sort(compareAssessmentQuarters);
  return displayedQuarters.length > 0 ? displayedQuarters : assessmentQuarters;
}

function getQuarterMetrics(summary: CoachSummary, quarter: AssessmentQuarter) {
  return (
    summary.quarters[quarter] ?? {
      assessedCount: 0,
      failCount: 0,
      failRate: 0,
      passCount: 0,
      passRate: 0,
      totalCount: 0
    }
  );
}

function getPassTextClass(quarter: AssessmentQuarter) {
  return getQuarterShadeIndex(quarter) >= 2 ? "text-green-600" : "text-green-800";
}

function getFailTextClass(quarter: AssessmentQuarter) {
  return getQuarterShadeIndex(quarter) >= 2 ? "text-red-600" : "text-red-800";
}

function getQuarterShadeIndex(quarter: AssessmentQuarter) {
  const match = quarter.match(/^Q(\d+)$/);
  return match ? Number(match[1]) - 1 : 0;
}
