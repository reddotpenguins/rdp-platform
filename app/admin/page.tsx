import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BarChart3,
  ClipboardList,
  FileUp,
  Inbox,
  Receipt,
  ShieldCheck,
  UserMinus,
  Users,
  type LucideIcon
} from "lucide-react";
import { SignOutButton } from "@/components/SignOutButton";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { profile } = await requireActiveStaffSession();

  if (profile.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex min-w-0 flex-col gap-4 rounded-lg border border-line bg-paper p-4 shadow-panel lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase text-teal">Red Dot Penguins</p>
          <h1 className="mt-1 break-words text-2xl font-semibold text-ink sm:text-3xl">
            Admin Home
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Choose the area you want to manage. Coach and lead coach accounts continue to open
            their assessment dashboard directly.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:w-auto">
          <Link
            href="/dashboard"
            className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-teal px-3 text-sm font-semibold text-white transition hover:bg-teal/90 sm:flex-none"
          >
            <BarChart3 aria-hidden="true" className="size-4" />
            Assessment
          </Link>
          <SignOutButton className="flex-1 sm:flex-none" />
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminCard
          href="/dashboard"
          icon={BarChart3}
          title="Coach assessment"
          description="Review coach-level pass and fail patterns."
        />
        <AdminCard
          href="/dashboard/quarter"
          icon={ClipboardList}
          title="Quarter assessment"
          description="Review student results by quarter and session."
        />
        <AdminCard
          href="/upload"
          icon={FileUp}
          title="Upload data"
          description="Import new assessment records."
        />
        <AdminCard
          href="/enquiries"
          icon={Inbox}
          title="Enquiries"
          description="Manage enquiry, trial, and sign-up tickets."
        />
        <AdminCard
          href="/students"
          icon={Users}
          title="Students"
          description="Track sign-ups and current student status."
        />
        <AdminCard
          href="/withdrawals"
          icon={UserMinus}
          title="Withdrawals"
          description="Record withdrawals, freeze, and status updates."
        />
        <AdminCard
          href="/claims"
          icon={Receipt}
          title="Claims"
          description="Review internal claims and claim setup."
        />
        <AdminCard
          href="/rba"
          icon={ShieldCheck}
          title="RBA"
          description="Invite staff and update roles."
        />
      </section>
    </main>
  );
}

function AdminCard({
  description,
  href,
  icon: Icon,
  title
}: {
  description: string;
  href: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-40 flex-col justify-between rounded-lg border border-line bg-paper p-4 shadow-panel transition hover:-translate-y-0.5 hover:border-teal hover:shadow-lg"
    >
      <span className="flex size-11 items-center justify-center rounded-lg bg-teal/10 text-teal transition group-hover:bg-teal group-hover:text-white">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <span>
        <span className="block text-lg font-semibold text-ink">{title}</span>
        <span className="mt-2 block text-sm leading-6 text-slate-500">{description}</span>
      </span>
    </Link>
  );
}
