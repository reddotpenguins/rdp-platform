"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { AssessmentQuarter, CoachSummary, DashboardMetrics } from "@/types/assessment";

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

type FailRateTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload?: FailCoachDatum }>;
};

const colors = {
  pass: {
    q1: "#15803d",
    q2: "#4ade80"
  },
  fail: {
    q1: "#b91c1c",
    q2: "#f87171"
  },
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
  const showQ1 = selectedQuarter === "All" || selectedQuarter === "Q1";
  const showQ2 = selectedQuarter === "All" || selectedQuarter === "Q2";
  const selectedQuarterLabel = selectedQuarter === "All" ? "Q1 vs Q2" : selectedQuarter;
  const passRateData: PassRateDatum[] = [];
  const passFailData: PassFailDatum[] = [];

  if (showQ1) {
    passRateData.push({ quarter: "Q1", passRate: Math.round(metrics.q1.passRate * 100) });
    passFailData.push({ quarter: "Q1", Pass: metrics.q1.passCount, Fail: metrics.q1.failCount });
  }

  if (showQ2) {
    passRateData.push({ quarter: "Q2", passRate: Math.round(metrics.q2.passRate * 100) });
    passFailData.push({ quarter: "Q2", Pass: metrics.q2.passCount, Fail: metrics.q2.failCount });
  }

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

      if (showQ1) {
        item["Q1 Pass Rate"] = Math.round(summary.q1PassRate * 100);
      }

      if (showQ2) {
        item["Q2 Pass Rate"] = Math.round(summary.q2PassRate * 100);
      }

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
            {showQ1 ? (
              <Bar dataKey="Q1 Pass Rate" fill={colors.pass.q1} radius={[4, 4, 0, 0]} />
            ) : null}
            {showQ2 ? (
              <Bar dataKey="Q2 Pass Rate" fill={colors.pass.q2} radius={[4, 4, 0, 0]} />
            ) : null}
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      <ChartPanel title={`${selectedQuarterLabel} fail rate by coach (failed / total)`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={failCoachData}
            layout="vertical"
            margin={{ left: 0, right: 72, top: 10, bottom: 0 }}
          >
            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
            <XAxis domain={[0, 100]} tickFormatter={percentTick} type="number" />
            <YAxis dataKey="coach" interval={0} type="category" width={96} />
            <Tooltip content={<FailRateTooltip />} />
            <Bar
              dataKey="Fail Rate"
              fill={getSummaryFailColor(selectedQuarter)}
              radius={[4, 4, 0, 0]}
            >
              <LabelList dataKey="rateLabel" fill="#334155" fontSize={12} position="right" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
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
  return quarter === "Q2" ? colors.pass.q2 : colors.pass.q1;
}

function getQuarterFailColor(quarter: AssessmentQuarter) {
  return quarter === "Q2" ? colors.fail.q2 : colors.fail.q1;
}

function getSummaryFailCount(summary: CoachSummary, selectedQuarter: "All" | AssessmentQuarter) {
  if (selectedQuarter === "Q1") {
    return summary.q1FailCount;
  }

  if (selectedQuarter === "Q2") {
    return summary.q2FailCount;
  }

  return summary.q1FailCount + summary.q2FailCount;
}

function getSummaryFailStats(summary: CoachSummary, selectedQuarter: "All" | AssessmentQuarter) {
  if (selectedQuarter === "Q1") {
    return {
      failCount: summary.q1FailCount,
      failRate: summary.q1FailRate,
      totalCount: summary.q1TotalCount
    };
  }

  if (selectedQuarter === "Q2") {
    return {
      failCount: summary.q2FailCount,
      failRate: summary.q2FailRate,
      totalCount: summary.q2TotalCount
    };
  }

  const failCount = summary.q1FailCount + summary.q2FailCount;
  const totalCount = summary.q1TotalCount + summary.q2TotalCount;

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
  if (selectedQuarter === "Q2") {
    return colors.fail.q2;
  }

  if (selectedQuarter === "Q1") {
    return colors.fail.q1;
  }

  return "#ef4444";
}

function FailRateTooltip({ active, payload }: FailRateTooltipProps) {
  const datum = payload?.[0]?.payload;

  if (!active || !datum) {
    return null;
  }

  return (
    <div className="rounded-md border border-line bg-paper px-3 py-2 text-sm shadow-panel">
      <p className="font-semibold text-ink">{datum.fullCoachName}</p>
      <p className="mt-1 text-slate-600">
        Fail rate: {datum.rateLabel}
      </p>
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
