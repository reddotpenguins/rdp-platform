import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canMutateDraftReceipt,
  getNextReceiptVersion,
  isCurrentReceiptExtractionAttempt,
  shouldHardDeleteDraftClaim
} from "../lib/claimReceiptWorkflow.ts";

describe("claim receipt workflow security", () => {
  it("allows only the claimant to mutate editable receipt drafts", () => {
    assert.equal(
      canMutateDraftReceipt({ claimantStaffId: "staff-1", status: "Draft" }, "staff-1"),
      true
    );
    assert.equal(
      canMutateDraftReceipt({ claimantStaffId: "staff-1", status: "Draft" }, "staff-2"),
      false
    );
    assert.equal(
      canMutateDraftReceipt({ claimantStaffId: "staff-1", status: "Submitted" }, "staff-1"),
      false
    );
  });

  it("detects stale extraction attempts after replacement or cancellation", () => {
    assert.equal(
      isCurrentReceiptExtractionAttempt(
        {
          deletedAt: null,
          extractionAttemptId: "attempt-2",
          receiptVersion: 2
        },
        { extractionAttemptId: "attempt-2", receiptVersion: 2 }
      ),
      true
    );
    assert.equal(
      isCurrentReceiptExtractionAttempt(
        {
          deletedAt: null,
          extractionAttemptId: "attempt-1",
          receiptVersion: 1
        },
        { extractionAttemptId: "attempt-2", receiptVersion: 2 }
      ),
      false
    );
    assert.equal(
      isCurrentReceiptExtractionAttempt(
        {
          deletedAt: "2026-08-07T00:00:00.000Z",
          extractionAttemptId: "attempt-2",
          receiptVersion: 2
        },
        { extractionAttemptId: "attempt-2", receiptVersion: 2 }
      ),
      false
    );
  });

  it("increments replacement versions and limits hard deletes to drafts", () => {
    assert.equal(getNextReceiptVersion([{ receiptVersion: 1 }, { receiptVersion: 3 }]), 4);
    assert.equal(shouldHardDeleteDraftClaim("Draft"), true);
    assert.equal(shouldHardDeleteDraftClaim("Submitted"), false);
  });
});
