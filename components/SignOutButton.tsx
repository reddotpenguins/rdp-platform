"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";

type SignOutButtonProps = {
  className?: string;
};

export function SignOutButton({ className }: SignOutButtonProps) {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className={clsx(
        "inline-flex h-10 items-center justify-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-semibold text-slate-700 transition hover:border-teal hover:text-teal",
        className
      )}
    >
      <LogOut aria-hidden="true" className="size-4" />
      Sign out
    </button>
  );
}
