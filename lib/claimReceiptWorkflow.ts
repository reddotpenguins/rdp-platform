import type { ClaimStatus } from "./claimsLogic";

export type ReceiptMutationContext = {
  claimantStaffId: string;
  status: ClaimStatus;
};

export type ReceiptExtractionAttemptContext = {
  deletedAt: string | null;
  extractionAttemptId: string | null;
  receiptVersion: number;
};

const editableClaimStatuses: ClaimStatus[] = ["Draft", "Returned for Correction"];

export function canMutateDraftReceipt(
  context: ReceiptMutationContext | null,
  staffProfileId: string
) {
  return Boolean(
    context &&
      context.claimantStaffId === staffProfileId &&
      editableClaimStatuses.includes(context.status)
  );
}

export function isCurrentReceiptExtractionAttempt(
  receipt: ReceiptExtractionAttemptContext | null,
  attempt: { extractionAttemptId: string; receiptVersion: number }
) {
  return Boolean(
    receipt &&
      !receipt.deletedAt &&
      receipt.extractionAttemptId === attempt.extractionAttemptId &&
      receipt.receiptVersion === attempt.receiptVersion
  );
}

export function getNextReceiptVersion(
  existingReceipts: Array<{ receiptVersion: number | null | undefined }>
) {
  return (
    Math.max(
      0,
      ...existingReceipts.map((receipt) => Number(receipt.receiptVersion || 0)).filter(Number.isFinite)
    ) + 1
  );
}

export function shouldHardDeleteDraftClaim(status: ClaimStatus) {
  return status === "Draft";
}
