import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/SignOutButton";
import { getCurrentStaffSession } from "@/lib/supabase/staffProfile";

export const metadata: Metadata = {
  title: "Access pending | RDP LTS Assessment Dashboard"
};

export const dynamic = "force-dynamic";

export default async function AccessPendingPage() {
  const { user, profile } = await getCurrentStaffSession();

  if (!user) {
    redirect("/login");
  }

  if (profile?.active) {
    redirect("/home");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fff1e6] px-4 py-6 text-[#3d2115] sm:px-6 lg:px-8">
      <section className="w-full max-w-xl rounded-lg border border-[#ffd6b3] bg-[#fff8f0] p-6 shadow-[0_24px_80px_rgba(180,72,22,0.18)] sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#c2410c]">
          RDP LTS Assessment
        </p>
        <h1 className="mt-4 text-2xl font-bold text-[#3d2115] sm:text-3xl">Access pending</h1>
        <p className="mt-3 text-sm leading-6 text-[#8a5a3c]">
          Your login is active, but your staff profile has not been connected yet. Ask an admin to
          add your profile in Supabase with the correct role.
        </p>
        <p className="mt-4 rounded-sm border border-[#fdba74] bg-[#fffaf5] px-3 py-2 text-sm font-medium text-[#7c2d12]">
          Signed in as {user.email}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <SignOutButton />
          <Link
            href="/login"
            className="inline-flex h-10 items-center justify-center rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal"
          >
            Back to login
          </Link>
        </div>
      </section>
    </main>
  );
}
