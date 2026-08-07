import { createHash, randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  canMutateDraftReceipt,
  getNextReceiptVersion,
  isCurrentReceiptExtractionAttempt,
  shouldHardDeleteDraftClaim
} from "@/lib/claimReceiptWorkflow";
import { createReceiptPath, safeDisplayFilename } from "@/lib/claimsLogic";
import {
  AzureDocumentIntelligenceReceiptExtractor,
  hasUsableReceiptExtraction,
  type NormalizedReceiptExtraction
} from "@/lib/receiptExtraction";
import { createOptionalSupabaseAdminClient } from "@/lib/supabase/admin";
import { getCurrentStaffSession } from "@/lib/supabase/staffProfile";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bucketName = "claim-receipts";
const defaultOrganisationSlug = "red-dot-penguins";
const azureFreeTierMaxBytes = 4 * 1024 * 1024;
const allowedAzureMimeTypes = ["image/jpeg", "image/png", "application/pdf"];

type ClaimRow = {
  claimant_staff_id: string;
  id: string;
  organisation_id: string;
  status: "Draft" | "Returned for Correction" | "Submitted" | "Under Review" | "Approved" | "Rejected" | "Paid" | "Cancelled";
};

type ReceiptRow = {
  deleted_at: string | null;
  extraction_attempt_id: string | null;
  id: string;
  receipt_version: number;
  storage_bucket: string;
  storage_object_path: string;
};

export async function POST(request: NextRequest) {
  const { profile } = await getCurrentStaffSession();

  if (!profile?.active) {
    return NextResponse.json({ error: "Please log in before extracting receipt details." }, { status: 401 });
  }

  const admin = createOptionalSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Receipt storage is not configured. Add SUPABASE_SERVICE_ROLE_KEY in Vercel." },
      { status: 503 }
    );
  }

  const azureConfig = getAzureConfig();

  if (!azureConfig) {
    return NextResponse.json(
      {
        error:
          "Azure receipt extraction is not configured. Add AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT and AZURE_DOCUMENT_INTELLIGENCE_KEY in Vercel."
      },
      { status: 503 }
    );
  }

  const formData = await request.formData();
  const receiptFile = formData.get("receipt");

  if (!(receiptFile instanceof File)) {
    return NextResponse.json({ error: "Upload a receipt photo or PDF first." }, { status: 400 });
  }

  const mimeType = receiptFile.type || getMimeTypeFromFilename(receiptFile.name);

  if (!allowedAzureMimeTypes.includes(mimeType)) {
    return NextResponse.json(
      { error: "Azure receipt extraction supports JPG, PNG, or PDF for this workflow." },
      { status: 400 }
    );
  }

  if (receiptFile.size <= 0) {
    return NextResponse.json({ error: "Receipt file is empty." }, { status: 400 });
  }

  if (receiptFile.size > azureFreeTierMaxBytes) {
    return NextResponse.json(
      { error: "Azure F0 can only process receipts up to 4MB. Upload a smaller JPG, PNG, or PDF." },
      { status: 400 }
    );
  }

  const groupName = getFormText(formData, "groupName");
  const categoryName = getFormText(formData, "categoryName");
  const existingClaimId = getFormText(formData, "claimId");
  const requestedAttemptId = getFormText(formData, "extractionAttemptId") || randomUUID();
  const safeName = safeDisplayFilename(receiptFile.name || "receipt");
  const extension = getExtensionFromFilename(safeName, mimeType);
  const organisation = await getDefaultOrganisation(admin);

  if (!organisation) {
    return NextResponse.json(
      { error: "Claims organisation setup is missing. Run supabase/claims-foundation.sql first." },
      { status: 500 }
    );
  }

  const group = await getConfigItem(admin, "organisational_groups", organisation.id, groupName);
  const category = await getConfigItem(admin, "expense_categories", organisation.id, categoryName);

  if (!group || !category) {
    return NextResponse.json(
      { error: "Claims group or category setup is missing. Ask an admin to check claim settings." },
      { status: 400 }
    );
  }

  const fileBuffer = Buffer.from(await receiptFile.arrayBuffer());
  const checksum = createHash("sha256").update(fileBuffer).digest("hex");
  let activeClaimId: string | null = null;
  let activeReceiptId: string | null = null;
  let uploadedObjectPath: string | null = null;

  try {
    const claim = existingClaimId
      ? await getEditableClaim(admin, existingClaimId, profile.id)
      : await createDraftClaim(admin, {
          categoryId: category.id,
          claimantName: getStaffDisplayName(profile),
          claimantStaffId: profile.id,
          groupId: group.id,
          organisationId: organisation.id
        });

    if (!claim) {
      return NextResponse.json(
        { error: "This draft claim can no longer be changed. Start a new claim instead." },
        { status: 403 }
      );
    }

    activeClaimId = claim.id;
    await invalidateExistingReceipts(admin, claim);

    const existingReceipts = await getClaimReceiptVersions(admin, claim.id);
    const receiptVersion = getNextReceiptVersion(existingReceipts);
    const receiptId = randomUUID();
    const storageObjectPath = createReceiptPath({
      claimId: claim.id,
      claimantUserId: profile.id,
      extension,
      organisationId: claim.organisation_id,
      uuid: receiptId
    });

    const uploadResult = await admin.storage.from(bucketName).upload(storageObjectPath, fileBuffer, {
      contentType: mimeType,
      upsert: false
    });
    uploadedObjectPath = storageObjectPath;

    if (uploadResult.error) {
      throw new Error("Receipt could not be uploaded to private storage.");
    }

    const receipt = await createReceiptRecord(admin, {
      checksum,
      claimId: claim.id,
      filename: receiptFile.name || safeName,
      mimeType,
      organisationId: claim.organisation_id,
      receiptId,
      receiptVersion,
      safeName,
      size: receiptFile.size,
      storageObjectPath,
      uploadedBy: profile.id,
      extractionAttemptId: requestedAttemptId
    });
    activeReceiptId = receipt.id;

    await markClaimExtractionRunning(admin, claim.id);

    const extractor = new AzureDocumentIntelligenceReceiptExtractor(azureConfig);
    const extraction = await extractor.extract({
      contentType: mimeType,
      data: fileBuffer.buffer.slice(fileBuffer.byteOffset, fileBuffer.byteOffset + fileBuffer.byteLength),
      filename: safeName
    });

    if (!hasUsableReceiptExtraction(extraction)) {
      throw new Error("Azure read the receipt but did not find enough claim details. Please enter the claim manually.");
    }

    const currentReceipt = await getReceiptAttempt(admin, receipt.id);

    if (
      !isCurrentReceiptExtractionAttempt(currentReceipt, {
        extractionAttemptId: requestedAttemptId,
        receiptVersion
      })
    ) {
      return NextResponse.json(
        { error: "This receipt was replaced or cancelled before extraction finished." },
        { status: 409 }
      );
    }

    await saveExtractionResult(admin, {
      claimId: claim.id,
      extraction,
      receiptId: receipt.id,
      receiptVersion,
      requestedAttemptId
    });

    return NextResponse.json({
      claimId: claim.id,
      extraction,
      receipt: {
        checksum,
        id: receipt.id,
        name: receiptFile.name || safeName,
        receiptVersion,
        safeName,
        size: receiptFile.size,
        storageObjectPath,
        type: mimeType,
        uploadedAt: receipt.uploaded_at,
        uploadedBy: profile.id
      },
      extractionAttemptId: requestedAttemptId,
      status: extraction.manualReviewRequired ? "review_required" : "completed"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Receipt extraction failed.";

    if (activeReceiptId) {
      await admin
        .from("claim_receipts")
        .update({
          extraction_completed_at: new Date().toISOString(),
          extraction_error: message,
          extraction_status: "failed"
        })
        .eq("id", activeReceiptId)
        .eq("extraction_attempt_id", requestedAttemptId);
    } else if (uploadedObjectPath) {
      await admin.storage.from(bucketName).remove([uploadedObjectPath]).catch(() => undefined);
    }

    if (activeClaimId) {
      await admin
        .from("claims")
        .update({
          extraction_status: "failed",
          extraction_review_status: "review_required",
          updated_at: new Date().toISOString()
        })
        .eq("id", activeClaimId)
        .in("status", ["Draft", "Returned for Correction"]);
    }

    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest) {
  const { profile } = await getCurrentStaffSession();

  if (!profile?.active) {
    return NextResponse.json({ error: "Please log in before changing receipt details." }, { status: 401 });
  }

  const admin = createOptionalSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Receipt storage is not configured. Add SUPABASE_SERVICE_ROLE_KEY in Vercel." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    claimId?: string;
    deleteClaim?: boolean;
    receiptId?: string;
  };

  if (!body.claimId && !body.receiptId) {
    return NextResponse.json({ error: "No draft receipt was selected." }, { status: 400 });
  }

  const receipt = body.receiptId ? await getReceiptById(admin, body.receiptId) : null;
  const claimId = body.claimId ?? receipt?.claim_id ?? "";
  const claim = claimId ? await getClaimById(admin, claimId) : null;

  if (!claim || !canMutateDraftReceipt({ claimantStaffId: claim.claimant_staff_id, status: claim.status }, profile.id)) {
    return NextResponse.json(
      { error: "This draft claim can no longer be changed." },
      { status: 403 }
    );
  }

  const receipts = receipt ? [receipt] : await getActiveReceipts(admin, claim.id);

  await Promise.all(
    receipts.map(async (item) => {
      await admin
        .from("claim_receipts")
        .update({
          deleted_at: new Date().toISOString(),
          extraction_status: "cancelled",
          extraction_error: "Cancelled by claimant before submission."
        })
        .eq("id", item.id);
      await admin.storage.from(item.storage_bucket).remove([item.storage_object_path]);
    })
  );

  if (body.deleteClaim && shouldHardDeleteDraftClaim(claim.status)) {
    await admin.from("claims").delete().eq("id", claim.id).eq("status", "Draft");
  } else {
    await admin
      .from("claims")
      .update({
        extraction_status: "not_started",
        extraction_review_status: "review_required",
        merchant_name: null,
        receipt_number: null,
        transaction_date: null,
        subtotal_amount: 0,
        gst_shown_amount: 0,
        total_spent_amount: 0,
        amount_requested: 0,
        gst_claimable_amount: 0,
        updated_at: new Date().toISOString()
      })
      .eq("id", claim.id);
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const { profile } = await getCurrentStaffSession();

  if (!profile?.active) {
    return NextResponse.json({ error: "Please log in before saving claim details." }, { status: 401 });
  }

  const admin = createOptionalSupabaseAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Claims storage is not configured. Add SUPABASE_SERVICE_ROLE_KEY in Vercel." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    amountRequested?: string;
    businessPurpose?: string;
    categoryName?: string;
    claimId?: string;
    currency?: string;
    groupName?: string;
    gstClaimable?: string;
    gstShown?: string;
    merchantName?: string;
    notes?: string;
    paymentMethod?: string;
    receiptNumber?: string;
    status?: "Draft" | "Submitted";
    subtotal?: string;
    totalSpent?: string;
    transactionDate?: string;
    validationWarnings?: string[];
  };

  if (!body.claimId) {
    return NextResponse.json({ error: "No draft claim was selected." }, { status: 400 });
  }

  const claim = await getEditableClaim(admin, body.claimId, profile.id);

  if (!claim) {
    return NextResponse.json(
      { error: "This draft claim can no longer be changed." },
      { status: 403 }
    );
  }

  const organisation = await getDefaultOrganisation(admin);

  if (!organisation) {
    return NextResponse.json(
      { error: "Claims organisation setup is missing. Run supabase/claims-foundation.sql first." },
      { status: 500 }
    );
  }

  const group = await getConfigItem(admin, "organisational_groups", organisation.id, body.groupName ?? "");
  const category = await getConfigItem(admin, "expense_categories", organisation.id, body.categoryName ?? "");

  if (!group || !category) {
    return NextResponse.json(
      { error: "Claims group or category setup is missing. Ask an admin to check claim settings." },
      { status: 400 }
    );
  }

  const submittedAt = body.status === "Submitted" ? new Date().toISOString() : null;

  await admin
    .from("claims")
    .update({
      amount_requested: moneyOrZero(body.amountRequested ?? null),
      business_purpose: normalizeNullableText(body.businessPurpose),
      currency: normalizeCurrency(body.currency) ?? "SGD",
      expense_category_id: category.id,
      extraction_review_status: "confirmed",
      extraction_status: "reviewed",
      group_id: group.id,
      gst_claimable_amount: moneyOrZero(body.gstClaimable ?? null),
      gst_shown_amount: moneyOrZero(body.gstShown ?? null),
      manual_review_required: false,
      merchant_name: normalizeNullableText(body.merchantName),
      notes: normalizeNullableText(body.notes),
      payment_method: normalizeNullableText(body.paymentMethod),
      receipt_number: normalizeNullableText(body.receiptNumber),
      status: body.status === "Submitted" ? "Submitted" : "Draft",
      submitted_at: submittedAt,
      subtotal_amount: moneyOrZero(body.subtotal ?? null),
      total_spent_amount: moneyOrZero(body.totalSpent ?? null),
      transaction_date: normalizeDate(body.transactionDate),
      updated_at: new Date().toISOString(),
      validation_warnings: Array.isArray(body.validationWarnings) ? body.validationWarnings : []
    })
    .eq("id", claim.id)
    .in("status", ["Draft", "Returned for Correction"]);

  return NextResponse.json({ ok: true });
}

function getAzureConfig() {
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT?.trim();
  const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY?.trim();

  if (!endpoint || !key) {
    return null;
  }

  return {
    apiVersion: process.env.AZURE_DOCUMENT_INTELLIGENCE_API_VERSION?.trim() || "2024-11-30",
    endpoint,
    key
  };
}

async function getDefaultOrganisation(admin: ReturnType<typeof createOptionalSupabaseAdminClient>) {
  if (!admin) return null;

  const { data } = await admin
    .from("organisations")
    .select("id")
    .eq("slug", defaultOrganisationSlug)
    .maybeSingle();

  return data as { id: string } | null;
}

async function getConfigItem(
  admin: NonNullable<ReturnType<typeof createOptionalSupabaseAdminClient>>,
  table: "expense_categories" | "organisational_groups",
  organisationId: string,
  itemName: string
) {
  const { data } = await admin
    .from(table)
    .select("id, name")
    .eq("organisation_id", organisationId)
    .ilike("name", itemName || "%")
    .limit(10);

  const rows = (data ?? []) as Array<{ id: string; name: string }>;

  return (
    rows.find((row) => row.name.trim().toLowerCase() === itemName.trim().toLowerCase()) ??
    rows[0] ??
    null
  );
}

async function createDraftClaim(
  admin: NonNullable<ReturnType<typeof createOptionalSupabaseAdminClient>>,
  values: {
    categoryId: string;
    claimantName: string;
    claimantStaffId: string;
    groupId: string;
    organisationId: string;
  }
) {
  const { data, error } = await admin
    .from("claims")
    .insert({
      claim_reference: createClaimReference(),
      claimant_name: values.claimantName,
      claimant_staff_id: values.claimantStaffId,
      expense_category_id: values.categoryId,
      extraction_status: "uploading",
      group_id: values.groupId,
      organisation_id: values.organisationId,
      status: "Draft"
    })
    .select("id, organisation_id, claimant_staff_id, status")
    .single();

  if (error) {
    throw new Error("Draft claim could not be created.");
  }

  return data as ClaimRow;
}

async function getEditableClaim(
  admin: NonNullable<ReturnType<typeof createOptionalSupabaseAdminClient>>,
  claimId: string,
  staffProfileId: string
) {
  const claim = await getClaimById(admin, claimId);

  if (
    !claim ||
    !canMutateDraftReceipt({ claimantStaffId: claim.claimant_staff_id, status: claim.status }, staffProfileId)
  ) {
    return null;
  }

  return claim;
}

async function getClaimById(
  admin: NonNullable<ReturnType<typeof createOptionalSupabaseAdminClient>>,
  claimId: string
) {
  const { data } = await admin
    .from("claims")
    .select("id, organisation_id, claimant_staff_id, status")
    .eq("id", claimId)
    .maybeSingle();

  return data as ClaimRow | null;
}

async function getClaimReceiptVersions(
  admin: NonNullable<ReturnType<typeof createOptionalSupabaseAdminClient>>,
  claimId: string
) {
  const { data } = await admin
    .from("claim_receipts")
    .select("receipt_version")
    .eq("claim_id", claimId);

  return ((data ?? []) as Array<{ receipt_version: number | null | undefined }>).map((receipt) => ({
    receiptVersion: receipt.receipt_version
  }));
}

async function getActiveReceipts(
  admin: NonNullable<ReturnType<typeof createOptionalSupabaseAdminClient>>,
  claimId: string
) {
  const { data } = await admin
    .from("claim_receipts")
    .select("id, claim_id, storage_bucket, storage_object_path, receipt_version, extraction_attempt_id, deleted_at")
    .eq("claim_id", claimId)
    .is("deleted_at", null);

  return (data ?? []) as Array<ReceiptRow & { claim_id: string }>;
}

async function invalidateExistingReceipts(
  admin: NonNullable<ReturnType<typeof createOptionalSupabaseAdminClient>>,
  claim: ClaimRow
) {
  const receipts = await getActiveReceipts(admin, claim.id);

  await Promise.all(
    receipts.map(async (receipt) => {
      await admin
        .from("claim_receipts")
        .update({
          deleted_at: new Date().toISOString(),
          extraction_status: "replaced",
          extraction_error: "Replaced by a newer receipt before submission."
        })
        .eq("id", receipt.id);
      await admin.storage.from(receipt.storage_bucket).remove([receipt.storage_object_path]);
    })
  );
}

async function createReceiptRecord(
  admin: NonNullable<ReturnType<typeof createOptionalSupabaseAdminClient>>,
  values: {
    checksum: string;
    claimId: string;
    extractionAttemptId: string;
    filename: string;
    mimeType: string;
    organisationId: string;
    receiptId: string;
    receiptVersion: number;
    safeName: string;
    size: number;
    storageObjectPath: string;
    uploadedBy: string;
  }
) {
  const { data, error } = await admin
    .from("claim_receipts")
    .insert({
      claim_id: values.claimId,
      extraction_attempt_id: values.extractionAttemptId,
      extraction_model: "prebuilt-receipt",
      extraction_provider: "azure-document-intelligence",
      extraction_started_at: new Date().toISOString(),
      extraction_status: "running",
      file_size_bytes: values.size,
      id: values.receiptId,
      is_original: true,
      mime_type: values.mimeType,
      organisation_id: values.organisationId,
      original_filename: values.filename,
      receipt_version: values.receiptVersion,
      safe_display_filename: values.safeName,
      sha256_checksum: values.checksum,
      storage_bucket: bucketName,
      storage_object_path: values.storageObjectPath,
      uploaded_by: values.uploadedBy
    })
    .select("id, uploaded_at")
    .single();

  if (error) {
    throw new Error("Receipt metadata could not be saved.");
  }

  return data as { id: string; uploaded_at: string };
}

async function markClaimExtractionRunning(
  admin: NonNullable<ReturnType<typeof createOptionalSupabaseAdminClient>>,
  claimId: string
) {
  await admin
    .from("claims")
    .update({
      extraction_status: "running",
      extraction_review_status: "review_required",
      updated_at: new Date().toISOString()
    })
    .eq("id", claimId);
}

async function getReceiptAttempt(
  admin: NonNullable<ReturnType<typeof createOptionalSupabaseAdminClient>>,
  receiptId: string
) {
  const { data } = await admin
    .from("claim_receipts")
    .select("deleted_at, extraction_attempt_id, receipt_version")
    .eq("id", receiptId)
    .maybeSingle();

  if (!data) {
    return null;
  }

  const row = data as {
    deleted_at: string | null;
    extraction_attempt_id: string | null;
    receipt_version: number;
  };

  return {
    deletedAt: row.deleted_at,
    extractionAttemptId: row.extraction_attempt_id,
    receiptVersion: row.receipt_version
  };
}

async function saveExtractionResult(
  admin: NonNullable<ReturnType<typeof createOptionalSupabaseAdminClient>>,
  values: {
    claimId: string;
    extraction: NormalizedReceiptExtraction;
    receiptId: string;
    receiptVersion: number;
    requestedAttemptId: string;
  }
) {
  const now = new Date().toISOString();
  const extractedFields = buildExtractedFields(values.extraction);

  await admin
    .from("claim_receipts")
    .update({
      extracted_fields: extractedFields,
      extraction_completed_at: now,
      extraction_error: null,
      extraction_status: "completed",
      field_confidences: values.extraction.fieldConfidences,
      manual_review_required: values.extraction.manualReviewRequired
    })
    .eq("id", values.receiptId)
    .eq("receipt_version", values.receiptVersion)
    .eq("extraction_attempt_id", values.requestedAttemptId)
    .is("deleted_at", null);

  await admin
    .from("claims")
    .update({
      amount_requested: moneyOrZero(values.extraction.amountRequested),
      currency: values.extraction.currency ?? "SGD",
      extracted_fields: extractedFields,
      extraction_confidence: values.extraction.confidence,
      extraction_review_status: values.extraction.manualReviewRequired
        ? "review_required"
        : "confirmed",
      extraction_status: "completed",
      field_confidences: values.extraction.fieldConfidences,
      gst_claimable_amount: moneyOrZero(values.extraction.gstClaimable),
      gst_shown_amount: moneyOrZero(values.extraction.gstShown),
      manual_review_required: values.extraction.manualReviewRequired,
      merchant_name: values.extraction.merchantName,
      payment_method: values.extraction.paymentMethod,
      receipt_number: values.extraction.receiptNumber,
      subtotal_amount: moneyOrZero(values.extraction.subtotal),
      total_spent_amount: moneyOrZero(values.extraction.totalSpent),
      transaction_date: values.extraction.transactionDate,
      updated_at: now,
      validation_warnings: values.extraction.warnings
    })
    .eq("id", values.claimId)
    .in("status", ["Draft", "Returned for Correction"]);
}

async function getReceiptById(
  admin: NonNullable<ReturnType<typeof createOptionalSupabaseAdminClient>>,
  receiptId: string
) {
  const { data } = await admin
    .from("claim_receipts")
    .select("id, claim_id, storage_bucket, storage_object_path, receipt_version, extraction_attempt_id, deleted_at")
    .eq("id", receiptId)
    .maybeSingle();

  return data as (ReceiptRow & { claim_id: string }) | null;
}

function buildExtractedFields(extraction: NormalizedReceiptExtraction) {
  return {
    amountRequested: extraction.amountRequested,
    currency: extraction.currency,
    gstClaimable: extraction.gstClaimable,
    gstShown: extraction.gstShown,
    merchantName: extraction.merchantName,
    paymentMethod: extraction.paymentMethod,
    receiptNumber: extraction.receiptNumber,
    subtotal: extraction.subtotal,
    totalSpent: extraction.totalSpent,
    transactionDate: extraction.transactionDate
  };
}

function getStaffDisplayName(profile: { coachName: string | null; email: string; fullName: string }) {
  return profile.fullName || profile.coachName || profile.email;
}

function getFormText(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function moneyOrZero(value: string | null) {
  const amount = Number(value ?? 0);

  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

function normalizeNullableText(value: string | null | undefined) {
  const trimmed = value?.trim();

  return trimmed || null;
}

function normalizeCurrency(value: string | null | undefined) {
  const trimmed = value?.trim().toUpperCase();

  return /^[A-Z]{3}$/.test(trimmed ?? "") ? trimmed ?? null : null;
}

function normalizeDate(value: string | null | undefined) {
  const trimmed = value?.trim();

  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed ?? "") ? trimmed : null;
}

function createClaimReference() {
  const date = new Date().toISOString().slice(2, 10).replace(/-/g, "");

  return `RDP-${date}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function getMimeTypeFromFilename(filename: string) {
  const extension = filename.split(".").pop()?.toLowerCase();

  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "pdf") return "application/pdf";

  return "application/octet-stream";
}

function getExtensionFromFilename(filename: string, mimeType: string) {
  const extension = filename.split(".").pop()?.toLowerCase();

  if (extension === "jpg" || extension === "jpeg" || extension === "png" || extension === "pdf") {
    return extension === "jpeg" ? "jpg" : extension;
  }

  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "image/png") return "png";

  return "jpg";
}
