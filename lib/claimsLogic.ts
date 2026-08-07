export const claimStatuses = [
  "Draft",
  "Submitted",
  "Under Review",
  "Returned for Correction",
  "Approved",
  "Rejected",
  "Paid",
  "Cancelled"
] as const;

export type ClaimStatus = (typeof claimStatuses)[number];

export const claimStatusTransitions: Record<ClaimStatus, ClaimStatus[]> = {
  Draft: ["Submitted", "Cancelled"],
  Submitted: ["Under Review", "Cancelled"],
  "Under Review": ["Returned for Correction", "Approved", "Rejected"],
  "Returned for Correction": ["Submitted", "Cancelled"],
  Approved: ["Paid"],
  Rejected: [],
  Paid: [],
  Cancelled: []
};

export type ClaimConfigItem = {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
};

export type ClaimGroup = ClaimConfigItem;

export type ExpenseCategory = ClaimConfigItem & {
  normallyGstClaimable: boolean;
};

export type ClaimSettings = {
  gstTrackingEnabled: boolean;
  defaultGstRate: number;
  organisationGstRegistered: boolean;
  manualFinanceReviewRequired: boolean;
  maxReceiptSizeBytes: number;
  allowApprovedAmountOverride: boolean;
};

export type ClaimReceipt = {
  id: string;
  name: string;
  safeName: string;
  type: string;
  size: number;
  checksum?: string;
  uploadedBy: string;
  uploadedAt: string;
  dataUrl?: string;
  extractionAttemptId?: string;
  receiptVersion?: number;
  serverClaimId?: string;
  serverReceiptId?: string;
  storageObjectPath?: string;
};

export type ClaimHistoryEntry = {
  at: string;
  by: string;
  fromStatus: ClaimStatus | null;
  toStatus: ClaimStatus;
  comment: string;
};

export type ClaimRecord = {
  id: string;
  claimantUserId: string;
  claimantName: string;
  groupId: string;
  categoryId: string;
  merchantName: string;
  receiptNumber: string;
  transactionDate: string;
  currency: string;
  subtotalCents: number;
  gstShownCents: number;
  totalSpentCents: number;
  amountRequestedCents: number;
  gstClaimableCents: number;
  nonClaimableCents: number;
  businessPurpose: string;
  paymentMethod: string;
  notes: string;
  status: ClaimStatus;
  submittedAt: string | null;
  approverUserId: string | null;
  approvalComment: string;
  approvedAmountCents: number | null;
  paidAt: string | null;
  possibleDuplicate: boolean;
  validationWarnings: string[];
  extractionStatus: "not_started" | "completed" | "failed" | "reviewed";
  extractionConfidence: number | null;
  extractionReviewStatus: "review_required" | "confirmed";
  receipt: ClaimReceipt | null;
  createdAt: string;
  updatedAt: string;
  history: ClaimHistoryEntry[];
};

export const defaultClaimSettings: ClaimSettings = {
  gstTrackingEnabled: true,
  defaultGstRate: 0.09,
  organisationGstRegistered: false,
  manualFinanceReviewRequired: true,
  maxReceiptSizeBytes: 4 * 1024 * 1024,
  allowApprovedAmountOverride: false
};

export const initialClaimGroups: ClaimGroup[] = [
  { id: "learn-to-swim", name: "Learn to Swim", active: true, sortOrder: 10 },
  { id: "race-team", name: "Race Team", active: true, sortOrder: 20 },
  { id: "learn-to-coach", name: "Learn to Coach", active: true, sortOrder: 30 },
  { id: "hq", name: "HQ", active: true, sortOrder: 40 },
  { id: "baby-class", name: "Baby Class", active: true, sortOrder: 50 }
];

export const initialExpenseCategories: ExpenseCategory[] = [
  { id: "equipment", name: "Equipment", active: true, sortOrder: 10, normallyGstClaimable: true },
  { id: "transport", name: "Transport", active: true, sortOrder: 20, normallyGstClaimable: false },
  {
    id: "meals-refreshments",
    name: "Meals and Refreshments",
    active: true,
    sortOrder: 30,
    normallyGstClaimable: false
  },
  { id: "training", name: "Training", active: true, sortOrder: 40, normallyGstClaimable: true },
  { id: "competition", name: "Competition", active: true, sortOrder: 50, normallyGstClaimable: true },
  { id: "venue", name: "Venue", active: true, sortOrder: 60, normallyGstClaimable: true },
  {
    id: "office-supplies",
    name: "Office Supplies",
    active: true,
    sortOrder: 70,
    normallyGstClaimable: true
  },
  { id: "marketing", name: "Marketing", active: true, sortOrder: 80, normallyGstClaimable: true },
  {
    id: "professional-services",
    name: "Professional Services",
    active: true,
    sortOrder: 90,
    normallyGstClaimable: true
  },
  { id: "other", name: "Other", active: true, sortOrder: 100, normallyGstClaimable: false }
];

export const allowedReceiptExtensions = ["jpg", "jpeg", "png", "pdf"];

export const allowedReceiptMimeTypes = [
  "image/jpeg",
  "image/png",
  "application/pdf"
];

export function sortClaimConfigItems<TItem extends ClaimConfigItem>(items: TItem[]) {
  return [...items].sort((first, second) => {
    if (Number(first.sortOrder) !== Number(second.sortOrder)) {
      return Number(first.sortOrder) - Number(second.sortOrder);
    }

    return first.name.localeCompare(second.name);
  });
}

export function slugifyClaimConfig(value: string) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || `item-${Date.now()}`;
}

export function canTransitionClaimStatus(fromStatus: ClaimStatus, toStatus: ClaimStatus) {
  return claimStatusTransitions[fromStatus].includes(toStatus);
}

export function transitionClaimStatus(
  claim: ClaimRecord,
  toStatus: ClaimStatus,
  actorId: string,
  comment = ""
) {
  if (!canTransitionClaimStatus(claim.status, toStatus)) {
    return {
      claim,
      error: `Cannot move claim from ${claim.status} to ${toStatus}.`
    };
  }

  const now = new Date().toISOString();
  const nextClaim: ClaimRecord = {
    ...claim,
    status: toStatus,
    updatedAt: now,
    submittedAt: toStatus === "Submitted" && !claim.submittedAt ? now : claim.submittedAt,
    paidAt: toStatus === "Paid" ? now : claim.paidAt,
    history: [
      ...claim.history,
      {
        at: now,
        by: actorId,
        fromStatus: claim.status,
        toStatus,
        comment
      }
    ]
  };

  return { claim: nextClaim, error: "" };
}

export function decimalToCents(value: string | number | null | undefined) {
  const text = String(value ?? "").trim();

  if (!text) {
    return 0;
  }

  if (!/^-?\d+(\.\d{0,2})?$/.test(text)) {
    return Number.NaN;
  }

  const sign = text.startsWith("-") ? -1 : 1;
  const unsigned = text.replace("-", "");
  const [wholePart, decimalPart = ""] = unsigned.split(".");
  const cents = Number(wholePart) * 100 + Number(decimalPart.padEnd(2, "0").slice(0, 2));

  return sign * cents;
}

export function centsToDecimal(cents: number | null | undefined) {
  const value = Number(cents || 0);
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);

  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function formatMoneyCents(cents: number | null | undefined, currency = "SGD") {
  try {
    return new Intl.NumberFormat("en-SG", {
      currency: currency || "SGD",
      style: "currency"
    }).format(Number(cents || 0) / 100);
  } catch {
    return `${currency || "SGD"} ${centsToDecimal(cents)}`;
  }
}

export function calculateNonClaimableCents(
  totalSpentCents: number | null | undefined,
  amountRequestedCents: number | null | undefined
) {
  return Math.max(0, Number(totalSpentCents || 0) - Number(amountRequestedCents || 0));
}

export function validateFinancials(
  values: {
    subtotalCents?: number | null;
    gstShownCents?: number | null;
    totalSpentCents?: number | null;
    amountRequestedCents?: number | null;
    gstClaimableCents?: number | null;
    approvedAmountCents?: number | null;
  },
  settings: ClaimSettings = defaultClaimSettings
) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const subtotalCents = Number(values.subtotalCents || 0);
  const gstShownCents = Number(values.gstShownCents || 0);
  const totalSpentCents = Number(values.totalSpentCents || 0);
  const amountRequestedCents = Number(values.amountRequestedCents || 0);
  const gstClaimableCents = Number(values.gstClaimableCents || 0);
  const approvedAmountCents = Number(values.approvedAmountCents || 0);

  if (subtotalCents < 0) errors.push("Subtotal cannot be negative.");
  if (gstShownCents < 0) errors.push("GST shown cannot be negative.");
  if (totalSpentCents < 0) errors.push("Total amount spent cannot be negative.");
  if (amountRequestedCents < 0) errors.push("Amount requested cannot be negative.");
  if (gstClaimableCents < 0) errors.push("GST claimable cannot be negative.");

  if (gstClaimableCents > gstShownCents) {
    errors.push("GST claimable cannot exceed GST shown without finance review.");
  }

  if (amountRequestedCents > totalSpentCents) {
    errors.push("Amount requested cannot exceed total amount spent.");
  }

  if (
    approvedAmountCents > amountRequestedCents &&
    !settings.allowApprovedAmountOverride
  ) {
    errors.push("Approved amount cannot exceed amount requested without an override reason.");
  }

  if (subtotalCents || gstShownCents) {
    const difference = Math.abs(subtotalCents + gstShownCents - totalSpentCents);

    if (difference > 2) {
      warnings.push("Subtotal plus GST does not match the total. Review for rounding or other charges.");
    }
  }

  if (
    settings.gstTrackingEnabled &&
    settings.manualFinanceReviewRequired &&
    gstClaimableCents > 0
  ) {
    warnings.push("GST claimable amount needs finance confirmation.");
  }

  return {
    errors,
    reviewRequired: warnings.length > 0,
    warnings
  };
}

export function safeDisplayFilename(filename: string | null | undefined) {
  const cleaned = String(filename || "receipt")
    .replace(/[/\\]/g, "-")
    .replace(/[^\w .()-]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || "receipt";
}

export function validateReceiptFile(
  file: Pick<File, "name" | "size" | "type"> | null,
  settings: ClaimSettings = defaultClaimSettings
) {
  const errors: string[] = [];
  const safeName = safeDisplayFilename(file?.name);
  const extension = safeName.includes(".")
    ? safeName.split(".").pop()?.toLowerCase() ?? ""
    : "";
  const type = String(file?.type || "").toLowerCase();
  const size = Number(file?.size || 0);

  if (!file) errors.push("Choose a receipt file.");
  if (size <= 0) errors.push("Receipt file is empty.");
  if (size > settings.maxReceiptSizeBytes) {
    errors.push(
      `Receipt must be ${Math.round(settings.maxReceiptSizeBytes / 1024 / 1024)}MB or smaller.`
    );
  }
  if (!allowedReceiptExtensions.includes(extension)) {
    errors.push("Receipt must be JPG, JPEG, PNG, or PDF.");
  }
  if (type && !allowedReceiptMimeTypes.includes(type)) {
    errors.push("Receipt file type is not supported.");
  }

  return {
    errors,
    extension,
    safeName,
    valid: errors.length === 0
  };
}

export function createReceiptPath({
  organisationId,
  claimantUserId,
  claimId,
  extension,
  uuid
}: {
  organisationId: string;
  claimantUserId: string;
  claimId: string;
  extension: string;
  uuid: string;
}) {
  return [organisationId, claimantUserId, claimId, `${uuid}.${extension}`]
    .map((part) => String(part || "").replace(/[^a-zA-Z0-9._-]/g, "-"))
    .join("/");
}

export function detectPossibleDuplicates(candidate: ClaimRecord, claims: ClaimRecord[]) {
  const merchant = candidate.merchantName.trim().toLowerCase();
  const receiptNumber = candidate.receiptNumber.trim().toLowerCase();

  return claims.filter((claim) => {
    if (claim.id === candidate.id) return false;
    if (claim.claimantUserId !== candidate.claimantUserId) return false;

    const sameChecksum =
      Boolean(candidate.receipt?.checksum) &&
      candidate.receipt?.checksum === claim.receipt?.checksum;
    const sameReceiptNumber =
      Boolean(receiptNumber) && claim.receiptNumber.trim().toLowerCase() === receiptNumber;
    const sameDetails =
      Boolean(merchant) &&
      merchant === claim.merchantName.trim().toLowerCase() &&
      candidate.transactionDate === claim.transactionDate &&
      candidate.totalSpentCents === claim.totalSpentCents;

    return sameChecksum || sameReceiptNumber || sameDetails;
  });
}

export function canDeleteReferencedItem(
  itemId: string,
  claims: ClaimRecord[],
  key: "groupId" | "categoryId"
) {
  return !claims.some((claim) => claim[key] === itemId);
}

export function getNextClaimReference(claims: ClaimRecord[], date = new Date()) {
  const prefix = `RDP-${date.toISOString().slice(2, 10).replace(/-/g, "")}`;
  const sequence =
    claims.filter((claim) => claim.id.startsWith(prefix)).length + 1;

  return `${prefix}-${String(sequence).padStart(3, "0")}`;
}

export function isClaimEditableByClaimant(claim: ClaimRecord, userId: string) {
  return (
    claim.claimantUserId === userId &&
    (claim.status === "Draft" || claim.status === "Returned for Correction")
  );
}

export function isVisibleInReviewQueue(claim: ClaimRecord) {
  return claim.status !== "Draft" && claim.status !== "Cancelled";
}
