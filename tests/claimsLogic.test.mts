import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateNonClaimableCents,
  canDeleteClaimDraft,
  canTransitionClaimStatus,
  createReceiptPath,
  decimalToCents,
  detectPossibleDuplicates,
  getClaimReceipts,
  validateFinancials,
  validateReceiptFile,
  type ClaimRecord
} from "../lib/claimsLogic.ts";

describe("claims financial rules", () => {
  it("keeps currency math in cents", () => {
    assert.equal(decimalToCents("86.40"), 8640);
    assert.equal(decimalToCents("86.4"), 8640);
    assert.equal(calculateNonClaimableCents(8640, 7000), 1640);
  });

  it("flags invalid GST and requested amounts", () => {
    const result = validateFinancials({
      amountRequestedCents: 9000,
      gstClaimableCents: 800,
      gstShownCents: 700,
      subtotalCents: 7927,
      totalSpentCents: 8640
    });

    assert.match(result.errors.join(" "), /GST claimable cannot exceed/);
    assert.match(result.errors.join(" "), /Amount requested cannot exceed/);
  });

  it("allows expected claim status transitions only", () => {
    assert.equal(canTransitionClaimStatus("Draft", "Submitted"), true);
    assert.equal(canTransitionClaimStatus("Submitted", "Approved"), false);
    assert.equal(canTransitionClaimStatus("Approved", "Paid"), true);
  });

  it("allows claimants to delete only their own draft claims", () => {
    assert.equal(canDeleteClaimDraft(buildClaim({ status: "Draft" }), "user-1"), true);
    assert.equal(canDeleteClaimDraft(buildClaim({ status: "Draft" }), "user-2"), false);
    assert.equal(canDeleteClaimDraft(buildClaim({ status: "Submitted" }), "user-1"), false);
  });
});

describe("claims receipt rules", () => {
  it("rejects unsafe receipt uploads", () => {
    const result = validateReceiptFile({
      name: "../receipt.exe",
      size: 10,
      type: "application/octet-stream"
    });

    assert.equal(result.valid, false);
    assert.match(result.errors.join(" "), /Receipt must be/);
  });

  it("builds non-guessable storage paths without original filenames", () => {
    const path = createReceiptPath({
      claimId: "RDP-260806-001",
      claimantUserId: "user-1",
      extension: "pdf",
      organisationId: "red-dot-penguins",
      uuid: "receipt-uuid"
    });

    assert.equal(path, "red-dot-penguins/user-1/RDP-260806-001/receipt-uuid.pdf");
  });
});

describe("claims duplicate detection", () => {
  it("finds duplicates by claimant, receipt number, merchant, date, or amount", () => {
    const existing = buildClaim({
      id: "RDP-260806-001",
      receiptNumber: "INV-123"
    });
    const candidate = buildClaim({
      id: "RDP-260806-002",
      receiptNumber: "INV-123"
    });

    assert.equal(detectPossibleDuplicates(candidate, [existing]).length, 1);
  });

  it("checks all receipt attachments for duplicate checksums", () => {
    const existing = buildClaim({
      id: "RDP-260806-001",
      receipt: null,
      receipts: [
        buildReceipt("receipt-a", "checksum-a"),
        buildReceipt("receipt-b", "checksum-b")
      ]
    });
    const candidate = buildClaim({
      id: "RDP-260806-002",
      receipt: null,
      receipts: [buildReceipt("receipt-c", "checksum-b")]
    });

    assert.equal(getClaimReceipts(existing).length, 2);
    assert.equal(detectPossibleDuplicates(candidate, [existing]).length, 1);
  });
});

function buildClaim(overrides: Partial<ClaimRecord>): ClaimRecord {
  const now = "2026-08-06T00:00:00.000Z";

  return {
    amountRequestedCents: 1000,
    approvalComment: "",
    approvedAmountCents: null,
    approverUserId: null,
    businessPurpose: "Pool equipment",
    categoryId: "equipment",
    claimantName: "Coach",
    claimantUserId: "user-1",
    createdAt: now,
    currency: "SGD",
    extractionConfidence: null,
    extractionReviewStatus: "review_required",
    extractionStatus: "not_started",
    groupId: "learn-to-swim",
    gstClaimableCents: 0,
    gstShownCents: 0,
    history: [],
    id: "RDP-260806-000",
    merchantName: "Merchant",
    nonClaimableCents: 0,
    notes: "",
    paidAt: null,
    paymentMethod: "",
    possibleDuplicate: false,
    receipt: null,
    receiptNumber: "",
    status: "Draft",
    submittedAt: null,
    subtotalCents: 1000,
    totalSpentCents: 1000,
    transactionDate: "2026-08-06",
    updatedAt: now,
    validationWarnings: [],
    ...overrides
  };
}

function buildReceipt(id: string, checksum: string) {
  return {
    checksum,
    id,
    name: `${id}.pdf`,
    safeName: `${id}.pdf`,
    size: 1000,
    type: "application/pdf",
    uploadedAt: "2026-08-06T00:00:00.000Z",
    uploadedBy: "user-1"
  };
}
