import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  createQuickBooksAuthorizationUrl,
  getQuickBooksConfig,
  quickBooksOAuthStateCookie
} from "@/lib/quickbooks";
import { hasStaffPermission } from "@/lib/staffRoles";
import { getCurrentStaffSession } from "@/lib/supabase/staffProfile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { profile } = await getCurrentStaffSession();

  if (!profile?.active) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!hasStaffPermission(profile, "claims.settings.manage")) {
    return NextResponse.redirect(new URL("/claims?quickbooks=not-authorized", request.url));
  }

  const config = getQuickBooksConfig();

  if (!config) {
    return NextResponse.redirect(new URL("/claims?quickbooks=missing-config", request.url));
  }

  const state = randomUUID();
  const response = NextResponse.redirect(createQuickBooksAuthorizationUrl(config, state));
  response.cookies.set(quickBooksOAuthStateCookie, state, {
    httpOnly: true,
    maxAge: 10 * 60,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });

  return response;
}
