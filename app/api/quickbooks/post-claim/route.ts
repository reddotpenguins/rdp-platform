import { NextResponse, type NextRequest } from "next/server";
import {
  buildQuickBooksPurchasePayload,
  createQuickBooksPurchase,
  getQuickBooksConfig,
  getQuickBooksPostingConfig,
  getQuickBooksTokenExpiryDate,
  refreshQuickBooksAccessToken,
  type QuickBooksConfig,
  type QuickBooksEnvironment,
  type QuickBooksPurchaseInput
} from "@/lib/quickbooks";
import { centsToDecimal } from "@/lib/claimsLogic";
import { hasStaffPermission } from "@/lib/staffRoles";
import { createOptionalSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentStaffSession } from "@/lib/supabase/staffProfile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ClaimRow = {
  claim_reference: string;
  claimant_staff_id: string;
  id: string;
  organisation_id: string;
  quickbooks_purchase_doc_number: string | null;
  quickbooks_purchase_id: string | null;
  quickbooks_sync_token: string | null;
  status: string;
};

type QuickBooksConnectionRow = {
  access_token: string;
  access_token_expires_at: string;
  environment: QuickBooksEnvironment;
  id: string;
  organisation_id: string;
  realm_id: string;
  refresh_token: string;
  refresh_token_expires_at: string;
};

type PostClaimRequestBody = {
  claimId?: unknown;
  claim?: Partial<QuickBooksPurchaseInput> & {
    amountCents?: unknown;
    approvedAmountCents?: unknown;
  };
};

export async function POST(request: NextRequest) {
  const { profile } = await getCurrentStaffSession();

  if (!profile?.active) {
    return NextResponse.json({ error: "Please log in before posting claims to QuickBooks." }, { status: 401 });
  }

  if (!hasStaffPermission(profile, "claims.markPaid")) {
    return NextResponse.json({ error: "Only admins can post paid claims to QuickBooks." }, { status: 403 });
  }

  const admin = createOptionalSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "QuickBooks posting needs SUPABASE_SERVICE_ROLE_KEY in Vercel." },
      { status: 503 }
    );
  }

  const quickBooksConfig = getQuickBooksConfig();
  const postingConfig = getQuickBooksPostingConfig();

  if (!quickBooksConfig || !postingConfig) {
    return NextResponse.json(
      {
        error:
          "QuickBooks posting is missing configuration. Add the QuickBooks OAuth values, payment account ID, and expense account ID in Vercel."
      },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as PostClaimRequestBody;
  const claimId = typeof body.claimId === "string" ? body.claimId.trim() : "";
  const claimInput = normalizeClaimInput(body.claim);

  if (!claimId || !claimInput) {
    return NextResponse.json({ error: "Claim details are missing." }, { status: 400 });
  }

  const claim = await getClaimById(admin, claimId);

  if (!claim) {
    return NextResponse.json({ error: "Claim was not found in Supabase." }, { status: 404 });
  }

  if (claim.claimant_staff_id === profile.id) {
    return NextResponse.json({ error: "You cannot post your own claim to QuickBooks." }, { status: 403 });
  }

  if (claim.quickbooks_purchase_id) {
    return NextResponse.json({
      alreadyPosted: true,
      docNumber: claim.quickbooks_purchase_doc_number ?? claim.claim_reference,
      postedAt: new Date().toISOString(),
      purchaseId: claim.quickbooks_purchase_id,
      syncToken: claim.quickbooks_sync_token ?? ""
    });
  }

  let connection = await getActiveConnection(admin, claim.organisation_id, quickBooksConfig.environment);

  if (!connection) {
    return NextResponse.json(
      { error: "QuickBooks is not connected yet. Connect QuickBooks from Claims > Setup first." },
      { status: 503 }
    );
  }

  try {
    connection = await refreshConnectionIfNeeded(admin, quickBooksConfig, connection);
  } catch {
    return NextResponse.json(
      { error: "QuickBooks token refresh failed. Reconnect QuickBooks from Claims > Setup." },
      { status: 502 }
    );
  }

  const purchasePayload = buildQuickBooksPurchasePayload(
    {
      ...claimInput,
      claimReference: claim.claim_reference || claimInput.claimReference
    },
    postingConfig
  );

  try {
    const purchase = await createQuickBooksPurchase({
      accessToken: connection.access_token,
      config: {
        environment: quickBooksConfig.environment,
        minorVersion: postingConfig.minorVersion
      },
      payload: purchasePayload,
      realmId: connection.realm_id,
      requestId: `rdp-claim-${claim.id}`
    });
    const postedAt = new Date().toISOString();
    const storageResult = await savePostedClaim(admin, {
      actorStaffId: profile.id,
      approvedAmountCents: claimInput.amountCents,
      claim,
      purchase,
      postedAt
    });

    if (!storageResult.ok) {
      return NextResponse.json({ error: storageResult.error }, { status: 500 });
    }

    return NextResponse.json({
      alreadyPosted: false,
      docNumber: purchase.docNumber || claim.claim_reference,
      postedAt,
      purchaseId: purchase.id,
      syncToken: purchase.syncToken
    });
  } catch (error) {
    await markPostingFailed(admin, claim.id, error instanceof Error ? error.message : "QuickBooks posting failed.");

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "QuickBooks posting failed." },
      { status: 502 }
    );
  }
}

async function getClaimById(
  admin: NonNullable<ReturnType<typeof createOptionalSupabaseAdminClient>>,
  claimId: string
) {
  const { data, error } = await admin
    .from("claims")
    .select(
      [
        "id",
        "organisation_id",
        "claim_reference",
        "claimant_staff_id",
        "status",
        "quickbooks_purchase_id",
        "quickbooks_sync_token",
        "quickbooks_purchase_doc_number"
      ].join(", ")
    )
    .eq("id", claimId)
    .maybeSingle();

  if (error) {
    return null;
  }

  return data as ClaimRow | null;
}

async function getActiveConnection(
  admin: NonNullable<ReturnType<typeof createOptionalSupabaseAdminClient>>,
  organisationId: string,
  environment: QuickBooksEnvironment
) {
  const { data } = await admin
    .from("quickbooks_connections")
    .select(
      [
        "id",
        "organisation_id",
        "environment",
        "realm_id",
        "access_token",
        "refresh_token",
        "access_token_expires_at",
        "refresh_token_expires_at"
      ].join(", ")
    )
    .eq("organisation_id", organisationId)
    .eq("environment", environment)
    .eq("active", true)
    .maybeSingle();

  return data as QuickBooksConnectionRow | null;
}

async function refreshConnectionIfNeeded(
  admin: NonNullable<ReturnType<typeof createOptionalSupabaseAdminClient>>,
  config: QuickBooksConfig,
  connection: QuickBooksConnectionRow
) {
  if (!isExpiringSoon(connection.access_token_expires_at)) {
    return connection;
  }

  const refreshed = await refreshQuickBooksAccessToken(config, connection.refresh_token);
  const nextConnection = {
    ...connection,
    access_token: refreshed.access_token,
    access_token_expires_at: getQuickBooksTokenExpiryDate(refreshed.expires_in),
    refresh_token: refreshed.refresh_token,
    refresh_token_expires_at: getQuickBooksTokenExpiryDate(refreshed.x_refresh_token_expires_in)
  };

  await admin
    .from("quickbooks_connections")
    .update({
      access_token: nextConnection.access_token,
      access_token_expires_at: nextConnection.access_token_expires_at,
      refresh_token: nextConnection.refresh_token,
      refresh_token_expires_at: nextConnection.refresh_token_expires_at,
      updated_at: new Date().toISOString()
    })
    .eq("id", connection.id);

  return nextConnection;
}

async function savePostedClaim(
  admin: NonNullable<ReturnType<typeof createOptionalSupabaseAdminClient>>,
  values: {
    actorStaffId: string;
    approvedAmountCents: number;
    claim: ClaimRow;
    postedAt: string;
    purchase: { docNumber: string; id: string; syncToken: string };
  }
) {
  const { error } = await admin
    .from("claims")
    .update({
      approved_amount: centsToDecimal(values.approvedAmountCents),
      paid_at: values.postedAt,
      quickbooks_error: null,
      quickbooks_last_attempt_at: values.postedAt,
      quickbooks_posted_at: values.postedAt,
      quickbooks_posting_status: "posted",
      quickbooks_purchase_doc_number: values.purchase.docNumber || values.claim.claim_reference,
      quickbooks_purchase_id: values.purchase.id,
      quickbooks_sync_token: values.purchase.syncToken,
      status: "Paid",
      updated_at: values.postedAt
    })
    .eq("id", values.claim.id);

  if (error) {
    return {
      error:
        "QuickBooks posted successfully, but Supabase could not save the Purchase ID. Run the latest QuickBooks SQL and reconcile this claim before retrying.",
      ok: false
    };
  }

  await admin.from("claim_status_history").insert({
    changed_at: values.postedAt,
    changed_by: values.actorStaffId,
    claim_id: values.claim.id,
    comment: `Posted to QuickBooks Purchase ${values.purchase.id}.`,
    from_status: values.claim.status,
    to_status: "Paid"
  });

  return { error: "", ok: true };
}

async function markPostingFailed(
  admin: NonNullable<ReturnType<typeof createOptionalSupabaseAdminClient>>,
  claimId: string,
  message: string
) {
  await admin
    .from("claims")
    .update({
      quickbooks_error: message,
      quickbooks_last_attempt_at: new Date().toISOString(),
      quickbooks_posting_status: "failed"
    })
    .eq("id", claimId);
}

function normalizeClaimInput(input: PostClaimRequestBody["claim"]): QuickBooksPurchaseInput | null {
  if (!input) {
    return null;
  }

  const amountCents = Number(input.amountCents ?? input.approvedAmountCents ?? 0);

  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return null;
  }

  return {
    amountCents,
    businessPurpose: normalizeText(input.businessPurpose),
    categoryName: normalizeText(input.categoryName),
    claimReference: normalizeText(input.claimReference),
    claimantName: normalizeText(input.claimantName),
    currency: normalizeCurrency(input.currency),
    groupName: normalizeText(input.groupName),
    gstClaimableCents: normalizeCents(input.gstClaimableCents),
    gstShownCents: normalizeCents(input.gstShownCents),
    merchantName: normalizeText(input.merchantName),
    notes: normalizeText(input.notes),
    receiptNumber: normalizeText(input.receiptNumber),
    transactionDate: normalizeText(input.transactionDate)
  };
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCurrency(value: unknown) {
  const text = normalizeText(value).toUpperCase();

  return /^[A-Z]{3}$/.test(text) ? text : "SGD";
}

function normalizeCents(value: unknown) {
  const cents = Number(value ?? 0);

  return Number.isFinite(cents) ? cents : 0;
}

function isExpiringSoon(value: string) {
  const expiresAt = Date.parse(value);

  return !Number.isFinite(expiresAt) || expiresAt <= Date.now() + 5 * 60 * 1000;
}
