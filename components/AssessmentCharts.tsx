"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { AssessmentQuarter, CoachSummary, DashboardMetrics } from "@/types/assessment";
import { assessmentQuarters, compareAssessmentQuarters } from "@/lib/assessmentLogic";

type AssessmentChartsProps = {
  metrics: DashboardMetrics;
  coachSummaries: CoachSummary[];
  selectedQuarter: "All" | AssessmentQuarter;
};

type PassRateDatum = {
  quarter: AssessmentQuarter;
  passRate: number;
};

type PassFailDatum = {
  quarter: AssessmentQuarter;
  Pass: number;
  Fail: number;
};

type FailCoachDatum = {
  coach: string;
  fullCoachName: string;
  "Fail Rate": number;
  failedStudents: number;
  totalStudents: number;
  rateLabel: string;
};

const colors = {
  pass: ["#15803d", "#16a34a", "#86efac", "#bbf7d0"],
  fail: ["#b91c1c", "#dc2626", "#fca5a5", "#fecaca"],
  none: "#cbd5e1",
  monitor: "#facc15",
  immediate: "#f97316"
};

function percentTick(value: number) {
  return `${value}%`;
}

function chartCoachName(name: string) {
  return name.length > 16 ? `${name.slice(0, 15)}.` : name;
}

export function AssessmentCharts({
  metrics,
  coachSummaries,
  selectedQuarter
}: AssessmentChartsProps) {
  const displayedQuarters = getDisplayedMetricQuarters(metrics, selectedQuarter);
  const selectedQuarterLabel =
    selectedQuarter === "All" ? displayedQuarters.join(" vs ") : selectedQuarter;
  const passRateData: PassRateDatum[] = displayedQuarters.map((quarter) => {
    const quarterMetrics = getMetricForQuarter(metrics, quarter);

    return { quarter, passRate: Math.round(quarterMetrics.passRate * 100) };
  });
  const passFailData: PassFailDatum[] = displayedQuarters.map((quarter) => {
    const quarterMetrics = getMetricForQuarter(metrics, quarter);

    return {
      quarter,
      Pass: quarterMetrics.passCount,
      Fail: quarterMetrics.failCount
    };
  });

  const flagData = [
    {
      name: "No immediate concern",
      value:
        metrics.totalUniqueStudents - metrics.yellowFlagCount - metrics.redFlagCount > 0
          ? metrics.totalUniqueStudents - metrics.yellowFlagCount - metrics.redFlagCount
          : 0,
      color: colors.none
    },
    { name: "Monitor", value: metrics.yellowFlagCount, color: colors.monitor },
    { name: "Immediate concern", value: metrics.redFlagCount, color: colors.immediate }
  ];

  const coachChartData = coachSummaries
    .slice()
    .sort((a, b) => b.totalStudents - a.totalStudents)
    .slice(0, 12)
    .map((summary) => {
      const item: Record<string, string | number> = {
        coach: chartCoachName(summary.coachName),
        "Fail Count": getSummaryFailCount(summary, selectedQuarter)
      };

      displayedQuarters.forEach((quarter) => {
        item[`${quarter} Pass Rate`] = Math.round(
          (summary.quarters[quarter]?.passRate ?? 0) * 100
        );
      });

      return item;
    });

  const failCoachData = coachSummaries
    .map((summary) => {
      const stats = getSummaryFailStats(summary, selectedQuarter);

      return {
        coach: chartCoachName(summary.coachName),
        fullCoachName: summary.coachName,
        "Fail Rate": Math.round(stats.failRate * 100),
        failedStudents: stats.failCount,
        totalStudents: stats.totalCount,
        rateLabel: formatFailRateLabel(stats.failCount, stats.totalCount)
      };
    })
    .filter((summary) => summary.failedStudents > 0)
    .slice()
    .sort(
      (a, b) =>
        b["Fail Rate"] - a["Fail Rate"] || b.failedStudents - a.failedStudents
    )
    .slice(0, 12);

  const redFlagCoachData = coachSummaries
    .filter((summary) => summary.redFlagCount > 0)
    .slice()
    .sort((a, b) => b.redFlagCount - a.redFlagCount)
    .slice(0, 12)
    .map((summary) => ({
      coach: chartCoachName(summary.coachName),
      Immediate: summary.redFlagCount
    }));

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <ChartPanel title={`${selectedQuarterLabel} pass rate`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={passRateData} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="quarter" />
            <YAxis tickFormatter={percentTick} domain={[0, 100]} />
            <Tooltip formatter={(value) => `${value}%`} />
            <Bar dataKey="passRate" radius={[4, 4, 0, 0]}>
              {passRateData.map((entry) => (
                <Cell
                  key={`pass-rate-${entry.quarter}`}
                  fill={getQuarterPassColor(entry.quarter)}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      <ChartPanel title={`${selectedQuarterLabel} pass and fail counts`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={passFailData} margin={{ left: 0, right: 8, top: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="quarter" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Legend />
            <Bar dataKey="Pass" radius={[4, 4, 0, 0]}>
              {passFailData.map((entry) => (
                <Cell key={`pass-${entry.quarter}`} fill={getQuarterPassColor(entry.quarter)} />
              ))}
            </Bar>
            <Bar dataKey="Fail" radius={[4, 4, 0, 0]}>
              {passFailData.map((entry) => (
                <Cell key={`fail-${entry.quarter}`} fill={getQuarterFailColor(entry.quarter)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      <ChartPanel title="Concern breakdown">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={flagData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92}>
              {flagData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </ChartPanel>

      <ChartPanel title={`${selectedQuarterLabel} coach pass rate`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={coachChartData} margin={{ left: 0, right: 8, top: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="coach" angle={-25} textAnchor="end" interval={0} height={62} />
            <YAxis tickFormatter={percentTick} domain={[0, 100]} />
            <Tooltip formatter={(value) => `${value}%`} />
            <Legend />
            {displayedQuarters.map((quarter) => (
              <Bar
                dataKey={`${quarter} Pass Rate`}
                fill={getQuarterPassColor(quarter)}
                key={`${quarter}-pass-rate`}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      <ChartPanel title={`${selectedQuarterLabel} fail rate by coach (failed / total)`}>
        <FailRateCoachList data={failCoachData} selectedQuarter={selectedQuarter} />
      </ChartPanel>

      <ChartPanel title="Immediate concerns by coach">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={redFlagCoachData} margin={{ left: 0, right: 8, top: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="coach" angle={-25} textAnchor="end" interval={0} height={62} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="Immediate" fill={colors.immediate} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>
    </section>
  );
}

function getQuarterPassColor(quarter: AssessmentQuarter) {
  return colors.pass[Math.min(getQuarterShadeIndex(quarter), colors.pass.length - 1)];
}

function getQuarterFailColor(quarter: AssessmentQuarter) {
  return colors.fail[Math.min(getQuarterShadeIndex(quarter), colors.fail.length - 1)];
}

function getSummaryFailCount(summary: CoachSummary, selectedQuarter: "All" | AssessmentQuarter) {
  if (selectedQuarter !== "All") {
    return summary.quarters[selectedQuarter]?.failCount ?? 0;
  }

  return Object.values(summary.quarters).reduce(
    (total, metrics) => total + (metrics?.failCount ?? 0),
    0
  );
}

function getSummaryFailStats(summary: CoachSummary, selectedQuarter: "All" | AssessmentQuarter) {
  if (selectedQuarter !== "All") {
    const metrics = summary.quarters[selectedQuarter];

    return {
      failCount: metrics?.failCount ?? 0,
      failRate: metrics?.failRate ?? 0,
      totalCount: metrics?.totalCount ?? 0
    };
  }

  const failCount = Object.values(summary.quarters).reduce(
    (total, metrics) => total + (metrics?.failCount ?? 0),
    0
  );
  const totalCount = Object.values(summary.quarters).reduce(
    (total, metrics) => total + (metrics?.totalCount ?? 0),
    0
  );

  return {
    failCount,
    failRate: totalCount > 0 ? failCount / totalCount : 0,
    totalCount
  };
}

function formatFailRateLabel(failCount: number, totalCount: number) {
  const failRate = totalCount > 0 ? failCount / totalCount : 0;

  return `${Math.round(failRate * 100)}% (${failCount}/${totalCount})`;
}

function getSummaryFailColor(selectedQuarter: "All" | AssessmentQuarter) {
  if (selectedQuarter !== "All") {
    return getQuarterFailColor(selectedQuarter);
  }

  return "#ef4444";
}

function getMetricForQuarter(metrics: DashboardMetrics, quarter: AssessmentQuarter) {
  return (
    metrics.quarters[quarter] ?? {
      assessedCount: 0,
      failCount: 0,
      passCount: 0,
      passRate: 0,
      totalCount: 0
    }
  );
}

function getDisplayedMetricQuarters(
  metrics: DashboardMetrics,
  selectedQuarter: "All" | AssessmentQuarter
) {
  if (selectedQuarter !== "All") {
    return [selectedQuarter];
  }

  const quarters = Object.keys(metrics.quarters).sort(
    (first, second) =>
      compareAssessmentQuarters(first as AssessmentQuarter, second as AssessmentQuarter)
  ) as AssessmentQuarter[];

  return quarters.length > 0 ? quarters : assessmentQuarters;
}

function getQuarterShadeIndex(quarter: AssessmentQuarter) {
  const match = quarter.match(/^Q(\d+)$/);
  return match ? Math.max(Number(match[1]) - 1, 0) : 0;
}

function FailRateCoachList({
  data,
  selectedQuarter
}: {
  data: FailCoachDatum[];
  selectedQuarter: "All" | AssessmentQuarter;
}) {
  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-line bg-field px-4 text-center text-sm text-slate-500">
        No failed students for this filter.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto pr-1">
      <div className="grid grid-cols-[9rem_minmax(0,1fr)_6.75rem] gap-3 border-b border-line pb-2 text-xs font-semibold uppercase text-slate-500">
        <span>Coach</span>
        <span>Fail rate</span>
        <span className="text-right">Rate / count</span>
      </div>
      <div className="mt-2 space-y-2.5">
        {data.map((item) => (
          <div
            className="grid grid-cols-[9rem_minmax(0,1fr)_6.75rem] items-center gap-3 text-sm"
            key={item.fullCoachName}
          >
            <span className="truncate font-medium text-ink" title={item.fullCoachName}>
              {item.fullCoachName}
            </span>
            <div
              aria-label={`${item.fullCoachName} fail rate ${item.rateLabel}`}
              className="h-4 overflow-hidden rounded-full bg-slate-100"
              role="img"
            >
              <div
                className="h-full rounded-full"
                style={{
                  backgroundColor: getSummaryFailColor(selectedQuarter),
                  width: `${Math.max(item["Fail Rate"], 3)}%`
                }}
              />
            </div>
            <span className="text-right font-semibold text-slate-700">{item.rateLabel}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="rounded-lg border border-line bg-paper p-4 shadow-panel">
      <h2 className="mb-3 text-lg font-semibold text-ink">{title}</h2>
      <div className="h-72 min-w-0">{children}</div>
    </article>
  );
}
