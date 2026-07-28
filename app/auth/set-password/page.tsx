import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { SetPasswordForm } from "@/components/SetPasswordForm";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Set password | RDP LTS Assessment Dashboard"
};

export const dynamic = "force-dynamic";

export default async function SetPasswordPage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?error=session-required");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fff1e6] px-4 py-6 text-[#3d2115] sm:px-6 lg:px-8">
      <section className="grid w-full max-w-4xl overflow-hidden rounded-lg border border-[#ffd6b3] bg-[#fff8f0] shadow-[0_24px_80px_rgba(180,72,22,0.18)] lg:grid-cols-[1fr_0.78fr]">
        <div className="min-w-0 p-6 sm:p-8 lg:p-10">
          <div className="text-center lg:text-left">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#c2410c]">
              RDP LTS Assessment
            </p>
            <h1 className="mt-4 text-2xl font-bold text-[#3d2115] sm:text-3xl">
              Set your password
            </h1>
            <p className="mt-2 text-base leading-6 text-[#8a5a3c]">
              Choose a password for your staff account before continuing.
            </p>
          </div>

          <SetPasswordForm />
        </div>

        <aside className="flex min-w-0 flex-col items-center justify-center border-t border-[#ffd6b3] bg-[#ffedd5] p-6 text-center lg:border-l lg:border-t-0 lg:p-10">
          <div className="flex size-48 items-center justify-center rounded-lg border border-[#fdba74] bg-white p-4 shadow-[0_12px_36px_rgba(180,72,22,0.2)] sm:size-56">
            <Image
              src="/brand/rdp-logo.png"
              alt="Red Dot Penguins logo"
              width={340}
              height={358}
              priority
              className="h-auto w-full"
            />
          </div>
          <h2 className="mt-8 text-xl font-bold text-[#3d2115]">Red Dot Penguins</h2>
          <p className="mt-2 max-w-xs text-sm leading-6 text-[#8a5a3c]">
            Secure access for internal coach assessment workflows.
          </p>
        </aside>
      </section>
    </main>
  );
}
