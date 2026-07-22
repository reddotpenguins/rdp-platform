"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import clsx from "clsx";
import { prototypeAuthStorageKey } from "@/lib/prototypeAuth";

type SignOutButtonProps = {
  className?: string;
};

export function SignOutButton({ className }: SignOutButtonProps) {
  const router = useRouter();

  function signOut() {
    window.localStorage.removeItem(prototypeAuthStorageKey);
    router.push("/login");
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
