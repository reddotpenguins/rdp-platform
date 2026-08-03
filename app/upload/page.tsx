import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Inbox, ShieldCheck } from "lucide-react";
import { FileUpload } from "@/components/FileUpload";
import { SignOutButton } from "@/components/SignOutButton";
import { canManageCustomerEnquiries, canUploadAssessmentData } from "@/lib/staffRoles";
import { requireActiveStaffSession } from "@/lib/supabase/staffProfile";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  const { profile } = await requireActiveStaffSession();

  if (!canUploadAssessmentData(profile)) {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-paper p-4 shadow-panel">
        <div>
          <p className="text-sm font-semibold uppercase text-teal">Red Dot Penguins</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink">Upload assessment data</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Dashboard
          </Link>
          {canManageCustomerEnquiries(profile) ? (
            <Link
              href="/enquiries"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal"
            >
              <Inbox aria-hidden="true" className="size-4" />
              Enquiries
            </Link>
          ) : null}
          {profile.role === "admin" ? (
            <Link
              href="/rba"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal"
            >
              <ShieldCheck aria-hidden="true" className="size-4" />
              RBA
            </Link>
          ) : null}
          <SignOutButton />
        </div>
      </header>

      <FileUpload />
    </main>
  );
}
