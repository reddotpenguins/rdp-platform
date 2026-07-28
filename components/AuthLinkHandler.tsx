"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AuthLinkHandlerProps = {
  fallbackPath?: string;
};

export function AuthLinkHandler({ fallbackPath }: AuthLinkHandlerProps) {
  const router = useRouter();

  useEffect(() => {
    let isActive = true;

    async function handleAuthLink() {
      const currentUrl = new URL(window.location.href);
      const hashParams = new URLSearchParams(currentUrl.hash.replace(/^#/, ""));
      const type = hashParams.get("type") || currentUrl.searchParams.get("type");
      const nextPath = getSafeNextPath(
        currentUrl.searchParams.get("next"),
        type === "invite" || type === "recovery" ? "/auth/set-password" : "/dashboard"
      );
      const authError = hashParams.get("error") || currentUrl.searchParams.get("error");

      if (authError) {
        router.replace("/login?error=auth-link-invalid");
        return;
      }

      const supabase = createClient();
      const code = currentUrl.searchParams.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (!isActive) {
          return;
        }

        if (error) {
          router.replace("/login?error=auth-link-invalid");
          return;
        }

        router.replace(nextPath);
        router.refresh();
        return;
      }

      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        });

        if (!isActive) {
          return;
        }

        if (error) {
          router.replace("/login?error=auth-link-invalid");
          return;
        }

        window.history.replaceState(
          null,
          "",
          `${currentUrl.pathname}${currentUrl.search}`
        );
        router.replace(nextPath);
        router.refresh();
        return;
      }

      if (fallbackPath) {
        router.replace(fallbackPath);
      }
    }

    void handleAuthLink();

    return () => {
      isActive = false;
    };
  }, [fallbackPath, router]);

  if (!fallbackPath) {
    return null;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fff1e6] px-4 text-[#3d2115]">
      <div className="rounded-lg border border-[#ffd6b3] bg-[#fff8f0] px-6 py-5 text-center shadow-[0_24px_80px_rgba(180,72,22,0.18)]">
        <p className="text-sm font-semibold text-[#c2410c]">Preparing your account...</p>
      </div>
    </main>
  );
}

function getSafeNextPath(nextPath: string | null, fallbackPath: string) {
  if (nextPath?.startsWith("/") && !nextPath.startsWith("//")) {
    return nextPath;
  }

  return fallbackPath;
}
