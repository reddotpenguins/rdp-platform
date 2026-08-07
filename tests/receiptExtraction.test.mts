import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildReceiptFieldStatuses,
  getAzureDocumentIntelligenceErrorMessage,
  normalizeAzureReceiptResult,
  shouldRequireManualReview
} from "../lib/receiptExtraction.ts";

describe("Azure receipt extraction mapping", () => {
  it("maps Azure prebuilt receipt fields into normalized claim fields", () => {
    const extraction = normalizeAzureReceiptResult({
      analyzeResult: {
        content: "Receipt No: 7 613\nGST 9.00% 3.60\nTotal SGD 43.60\nNETS",
        documents: [
          {
            confidence: 0.92,
            fields: {
              MerchantName: { confidence: 0.97, type: "string", valueString: "SWIM GEAR SHOP" },
              Subtotal: {
                confidence: 0.94,
                type: "currency",
                valueCurrency: { amount: 40, currencyCode: "SGD" }
              },
              Tax: {
                confidence: 0.91,
                type: "currency",
                valueCurrency: { amount: 3.6, currencyCode: "SGD" }
              },
              Total: {
                confidence: 0.96,
                type: "currency",
                valueCurrency: { amount: 43.6, currencyCode: "SGD" }
              },
              TransactionDate: { confidence: 0.89, type: "date", valueDate: "2026-08-07" }
            }
          }
        ]
      },
      status: "succeeded"
    });

    assert.equal(extraction.provider, "azure-document-intelligence");
    assert.equal(extraction.model, "prebuilt-receipt");
    assert.equal(extraction.merchantName, "SWIM GEAR SHOP");
    assert.equal(extraction.receiptNumber, "7613");
    assert.equal(extraction.transactionDate, "2026-08-07");
    assert.equal(extraction.currency, "SGD");
    assert.equal(extraction.subtotal, "40.00");
    assert.equal(extraction.gstShown, "3.60");
    assert.equal(extraction.gstClaimable, "3.60");
    assert.equal(extraction.totalSpent, "43.60");
    assert.equal(extraction.amountRequested, "43.60");
    assert.equal(extraction.paymentMethod, "NETS");
    assert.equal(extraction.fieldStatuses.totalSpent, "confirmed");
    assert.equal(extraction.fieldStatuses.receiptNumber, "verify");
  });

  it("marks low-confidence and missing fields for manual review", () => {
    const statuses = buildReceiptFieldStatuses(
      {
        gstShown: "3.60",
        merchantName: "Shop",
        paymentMethod: null,
        receiptNumber: null,
        subtotal: "40.00",
        totalSpent: "43.60",
        transactionDate: "2026-08-07"
      },
      {
        gstShown: 0.7,
        merchantName: 0.74,
        subtotal: 0.95,
        totalSpent: 0.96,
        transactionDate: 0.9
      }
    );

    assert.equal(statuses.gstShown, "verify");
    assert.equal(statuses.merchantName, "verify");
    assert.equal(statuses.paymentMethod, "missing");
    assert.equal(statuses.totalSpent, "confirmed");
    assert.equal(shouldRequireManualReview(statuses), true);
  });

  it("returns a safe error when Azure F0 limits block extraction", async () => {
    const response = new Response(JSON.stringify({ error: { message: "file size too large" } }), {
      status: 413
    });

    assert.match(await getAzureDocumentIntelligenceErrorMessage(response), /4MB/);
  });
});
