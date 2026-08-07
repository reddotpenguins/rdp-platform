import { NextResponse, type NextRequest } from "next/server";
import {
  exchangeQuickBooksAuthorizationCode,
  getQuickBooksConfig,
  getQuickBooksTokenExpiryDate,
  quickBooksOAuthStateCookie
} from "@/lib/quickbooks";
import { hasStaffPermission } from "@/lib/staffRoles";
import { createOptionalSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentStaffSession } from "@/lib/supabase/staffProfile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const defaultOrganisationSlug = "red-dot-penguins";

export async function GET(request: NextRequest) {
  const callbackUrl = new URL(request.url);
  const code = callbackUrl.searchParams.get("code");
  const error = callbackUrl.searchParams.get("error");
  const realmId = callbackUrl.searchParams.get("realmId");
  const state = callbackUrl.searchParams.get("state");
  const savedState = request.cookies.get(quickBooksOAuthStateCookie)?.value;
  const { profile } = await getCurrentStaffSession();

  if (!profile?.active) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const clearAndRedirect = (status: string) => {
    const response = NextResponse.redirect(new URL(`/claims?quickbooks=${status}`, request.url));
    response.cookies.delete(quickBooksOAuthStateCookie);
    return response;
  };

  if (!hasStaffPermission(profile, "claims.settings.manage")) {
    return clearAndRedirect("not-authorized");
  }

  const config = getQuickBooksConfig();

  if (!config) {
    return clearAndRedirect("missing-config");
  }

  if (!savedState || !state || savedState !== state) {
    return clearAndRedirect("invalid-state");
  }

  if (error) {
    return clearAndRedirect("denied");
  }

  if (!code || !realmId) {
    return clearAndRedirect("missing-callback");
  }

  const admin = createOptionalSupabaseAdminClient();

  if (!admin) {
    return clearAndRedirect("missing-service-role");
  }

  const organisation = await getDefaultOrganisation(admin);

  if (!organisation) {
    return clearAndRedirect("missing-organisation");
  }

  let tokens;

  try {
    tokens = await exchangeQuickBooksAuthorizationCode(config, code);
  } catch {
    return clearAndRedirect("token-error");
  }

  const { error: storageError } = await admin.from("quickbooks_connections").upsert(
    {
      access_token: tokens.access_token,
      access_token_expires_at: getQuickBooksTokenExpiryDate(tokens.expires_in),
      active: true,
      connected_at: new Date().toISOString(),
      connected_by: profile.id,
      environment: config.environment,
      organisation_id: organisation.id,
      realm_id: realmId,
      refresh_token: tokens.refresh_token,
      refresh_token_expires_at: getQuickBooksTokenExpiryDate(tokens.x_refresh_token_expires_in),
      updated_at: new Date().toISOString()
    },
    { onConflict: "organisation_id,environment" }
  );

  if (storageError) {
    return clearAndRedirect("storage-error");
  }

  return clearAndRedirect("connected");
}

async function getDefaultOrganisation(admin: NonNullable<ReturnType<typeof createOptionalSupabaseAdminClient>>) {
  const { data } = await admin
    .from("organisations")
    .select("id")
    .eq("slug", defaultOrganisationSlug)
    .maybeSingle();

  return data as { id: string } | null;
}
