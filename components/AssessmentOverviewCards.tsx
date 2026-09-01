import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  type LucideIcon
} from "lucide-react";
import { formatPercent } from "@/lib/assessmentLogic";
import type { AssessmentOverview } from "@/lib/assessmentStatus";

type AssessmentOverviewCardsProps = {
  overview: AssessmentOverview;
};

type OverviewCard = {
  icon: LucideIcon;
  label: string;
  tone: "neutral" | "green" | "red" | "yellow" | "orange" | "slate" | "teal";
  value: string;
};

const toneClasses: Record<OverviewCard["tone"], string> = {
  green: "border-green-200 bg-green-50 text-green-800",
  neutral: "border-line bg-paper text-ink",
  orange: "border-orange-200 bg-orange-50 text-orange-800",
  red: "border-red-200 bg-red-50 text-red-800",
  slate: "border-slate-200 bg-slate-50 text-slate-700",
  teal: "border-teal/25 bg-teal/10 text-teal",
  yellow: "border-yellow-200 bg-yellow-50 text-yellow-800"
};

export function AssessmentOverviewCards({ overview }: AssessmentOverviewCardsProps) {
  const cards: OverviewCard[] = [
    {
      icon: Users,
      label: "Students",
      tone: "neutral",
      value: overview.totalStudents.toLocaleString()
    },
    {
      icon: ClipboardCheck,
      label: "Assessed",
      tone: "teal",
      value: overview.assessedStudents.toLocaleString()
    },
    {
      icon: TrendingUp,
      label: "Pass rate",
      tone: "green",
      value: formatPercent(overview.passRate)
    },
    {
      icon: TrendingDown,
      label: "Fail rate",
      tone: "red",
      value: formatPercent(overview.failRate)
    },
    {
      icon: CheckCircle2,
      label: "Ready to advance",
      tone: "green",
      value: overview.statusCounts["Ready to advance"].toLocaleString()
    },
    {
      icon: Clock3,
      label: "Monitor",
      tone: "yellow",
      value: overview.statusCounts.Monitor.toLocaleString()
    },
    {
      icon: AlertTriangle,
      label: "Require intervention",
      tone: "orange",
      value: overview.statusCounts["Require intervention"].toLocaleString()
    },
    {
      icon: Target,
      label: "Not assessed",
      tone: "slate",
      value: overview.statusCounts["Due for assessment"].toLocaleString()
    }
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <OverviewMetricCard key={card.label} card={card} />
      ))}
    </section>
  );
}

function OverviewMetricCard({ card }: { card: OverviewCard }) {
  const Icon = card.icon;

  return (
    <article className={`rounded-lg border p-4 shadow-panel ${toneClasses[card.tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{card.label}</p>
          <p className="mt-2 text-2xl font-semibold text-ink">{card.value}</p>
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-white/70">
          <Icon aria-hidden="true" className="size-5" />
        </span>
      </div>
    </article>
  );
}
