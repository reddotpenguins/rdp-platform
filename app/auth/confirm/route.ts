import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const code = requestUrl.searchParams.get("code");
  const nextPath = getSafeNextPath(requestUrl.searchParams.get("next"), type);
  const supabase = createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type
    });

    if (!error) {
      return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
    }
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=auth-link-invalid", requestUrl.origin));
}

function getSafeNextPath(next: string | null, type: EmailOtpType | null) {
  if (next?.startsWith("/") && !next.startsWith("//")) {
    return next;
  }

  if (type === "invite" || type === "recovery") {
    return "/auth/set-password";
  }

  return "/home";
}
